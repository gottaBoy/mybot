from __future__ import annotations

import os
import stat
from pathlib import Path, PurePosixPath

from .schemas import relative_path


class ContextError(ValueError):
    pass


ALLOWED_SUFFIXES = {
    ".md", ".txt", ".rst", ".py", ".js", ".mjs", ".ts", ".tsx", ".jsx",
    ".css", ".html", ".vue", ".json", ".toml", ".yaml", ".yml", ".go",
    ".rs", ".java", ".kt", ".c", ".cpp", ".h", ".sql", ".sh",
}
BLOCKED_PARTS = {"node_modules", "vendor", "data", "credentials", "secrets", "logs"}


def validate_directory(workspace: Path, relative: str) -> None:
    relative_path(relative)
    cursor = workspace
    for part in PurePosixPath(relative).parts:
        if part.startswith(".") or part.lower() in BLOCKED_PARTS:
            raise ContextError("Hidden or sensitive project directories are not allowed")
        cursor = cursor / part
        if cursor.is_symlink():
            raise ContextError("Project directories cannot traverse symbolic links")
    if not cursor.is_dir() or not cursor.resolve().is_relative_to(workspace.resolve()):
        raise ContextError("Project directory is not inside the configured workspace")


def snapshot(workspace: Path, project: dict, files: list[str]) -> tuple[str, list[dict]]:
    """Open explicit text files with no-follow descriptors, never crawl a repository."""
    validate_directory(workspace, project["directory"])
    sections = []
    evidence = []
    size = 0
    for name in files:
        relative_path(name)
        parts = PurePosixPath(name).parts
        if not parts or any(
            part.startswith(".") or part.lower() in BLOCKED_PARTS
            or any(word in part.lower() for word in ("secret", "credential", "private_key"))
            for part in parts
        ):
            raise ContextError(f"Sensitive or generated paths are not allowed: {name}")
        if PurePosixPath(name).suffix.lower() not in ALLOWED_SUFFIXES:
            raise ContextError(f"Only explicit source/text files are supported: {name}")
        descriptor = os.open(workspace, os.O_RDONLY | os.O_DIRECTORY)
        try:
            for part in (*PurePosixPath(project["directory"]).parts, *parts[:-1]):
                next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = next_fd
            file_fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=descriptor)
            try:
                info = os.fstat(file_fd)
                if not stat.S_ISREG(info.st_mode) or info.st_size > 32768:
                    raise ContextError(f"File must be a regular text file, at most 32 KiB: {name}")
                with os.fdopen(file_fd, "rb", closefd=False) as handle:
                    raw = handle.read(32769)
                if b"\x00" in raw or len(raw) > 32768:
                    raise ContextError(f"File is binary or too large: {name}")
                text = raw.decode("utf-8")
            finally:
                os.close(file_fd)
        except (OSError, UnicodeError) as exc:
            raise ContextError(f"Cannot safely read file: {name}") from exc
        finally:
            os.close(descriptor)
        size += len(raw)
        if size > 65536:
            raise ContextError("Selected file context exceeds 64 KiB")
        sections.append(f"FILE {name}\n{text}\nEND FILE")
        evidence.append({"path": name, "bytes": len(raw)})
    return "\n\n".join(sections), evidence
