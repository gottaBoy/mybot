"""Private workspace view definitions; no model, filesystem or provider actions."""

from __future__ import annotations

import json
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


TaskColumn = Literal[
    "id", "title", "projectName", "status", "updated", "attempts", "created_at",
]
TASK_COLUMNS = ("id", "title", "projectName", "status", "updated", "attempts", "created_at")
QueryState = Literal["pending", "active", "attention", "completed", "other"]
ProjectIdentifier = Annotated[str, Field(min_length=1, max_length=100)]
SAVED_VIEW_ID = re.compile(
    r"(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
)
SORT_QUERIES = {
    "", "ORDER BY CREATED ASC", "ORDER BY CREATED DESC",
    "ORDER BY SUMMARY ASC", "ORDER BY SUMMARY DESC",
}


class SavedViewError(Exception):
    def __init__(self, code: str, status: int, current_revision: int | None = None):
        super().__init__(code)
        self.code = code
        self.status = status
        self.current_revision = current_revision

    def detail(self) -> dict:
        return {
            "code": self.code,
            **({"current_revision": self.current_revision}
               if self.current_revision is not None else {}),
        }


class ViewInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


def unique(values: list, code: str) -> list:
    if len(set(values)) != len(values):
        raise ValueError(code)
    return values


class SavedViewQuery(ViewInput):
    text: str = Field(max_length=2000)
    projects: list[ProjectIdentifier] = Field(max_length=100)
    states: list[QueryState] = Field(max_length=5)
    jql: str = Field(max_length=2000)
    mode: Literal["basic", "jql"]

    @field_validator("projects")
    @classmethod
    def project_values(cls, values: list[str]) -> list[str]:
        if any(value.strip() != value for value in values):
            raise ValueError("saved_view_project_invalid")
        return unique(values, "saved_view_projects_duplicate")

    @field_validator("states")
    @classmethod
    def state_values(cls, values: list[str]) -> list[str]:
        return unique(values, "saved_view_states_duplicate")

    @field_validator("jql")
    @classmethod
    def supported_jql(cls, value: str) -> str:
        normalized = " ".join(value.split()).upper()
        if normalized not in SORT_QUERIES:
            raise ValueError("saved_view_jql_unsupported")
        return normalized


class SavedViewSortRule(ViewInput):
    sortKey: TaskColumn
    direction: Literal["ascending", "descending"]


class SavedViewTable(ViewInput):
    page_size: Literal[20, 50, 100]
    sorts: list[SavedViewSortRule] = Field(max_length=3)
    columns: list[TaskColumn] = Field(min_length=1, max_length=7)
    column_order: list[TaskColumn] = Field(min_length=7, max_length=7)

    @field_validator("page_size", mode="before")
    @classmethod
    def integer_page_size(cls, value):
        if type(value) is not int:
            raise ValueError("saved_view_page_size_invalid")
        return value

    @field_validator("sorts")
    @classmethod
    def unique_sort_keys(cls, values: list[SavedViewSortRule]):
        unique([value.sortKey for value in values], "saved_view_sorts_duplicate")
        return values

    @field_validator("columns")
    @classmethod
    def visible_title(cls, values: list[str]) -> list[str]:
        unique(values, "saved_view_columns_duplicate")
        if "title" not in values:
            raise ValueError("saved_view_title_required")
        return values

    @field_validator("column_order")
    @classmethod
    def complete_order(cls, values: list[str]) -> list[str]:
        if set(values) != set(TASK_COLUMNS):
            raise ValueError("saved_view_column_order_invalid")
        return values


class SavedViewDefinition(ViewInput):
    schema_version: int = Field(ge=1, le=1)
    query: SavedViewQuery
    table: SavedViewTable


class SavedViewNamed(ViewInput):
    name: str = Field(min_length=1, max_length=100)
    definition: SavedViewDefinition

    @field_validator("name", mode="before")
    @classmethod
    def trimmed_name(cls, value):
        return value.strip() if isinstance(value, str) else value


def require_scope(scope_type: str, project_id: str | None, definition: dict) -> None:
    if (
        (scope_type == "workspace" and project_id is not None) or
        (scope_type == "project" and (
            not project_id or definition["query"]["projects"] != [project_id]
        ))
    ):
        raise SavedViewError("saved_view_scope_invalid", 422)


class SavedViewCreate(SavedViewNamed):
    id: str = Field(min_length=32, max_length=36)
    scope_type: Literal["workspace", "project"]
    project_id: ProjectIdentifier | None

    @field_validator("id")
    @classmethod
    def client_identifier(cls, value: str) -> str:
        if not SAVED_VIEW_ID.fullmatch(value):
            raise ValueError("saved_view_id_invalid")
        return value

    @model_validator(mode="after")
    def fixed_scope(self):
        try:
            require_scope(self.scope_type, self.project_id, self.definition.model_dump())
        except SavedViewError as error:
            raise ValueError(error.code) from error
        return self


class SavedViewUpdate(SavedViewNamed):
    expected_revision: int = Field(ge=1)


class SavedViewDelete(ViewInput):
    expected_revision: int = Field(ge=1)


def require_identifier(identifier: str) -> None:
    if not SAVED_VIEW_ID.fullmatch(identifier):
        raise SavedViewError("saved_view_id_invalid", 422)


def public_saved_view(record: dict) -> dict:
    return {
        key: json.loads(record[key]) if key == "definition" else record[key]
        for key in (
            "id", "name", "scope_type", "project_id", "definition",
            "revision", "created_at", "updated_at",
        )
    }


def saved_view_delete_receipt(record: dict) -> dict:
    return {
        "id": record["id"], "deleted": True, "revision": record["revision"],
        "deleted_at": record["deleted_at"],
    }
