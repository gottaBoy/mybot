# Product UI Boundary

New product pages import these wrappers, not `@astryxdesign/*` directly. The
template catalog and preserved earlier React slice are separate legacy/reference
boundaries. Generic wrappers do not contain Run, Model or Project logic.

```tsx
<AppButton
  label={t('保存', 'Save')}
  icon={<Save size={16} />}
  busy={saving}
  disabled={!valid}
  type="submit"
  tone="primary"
/>
<AppButton label={t('刷新', 'Refresh')} icon={<RefreshCw size={16} />} iconOnly />
<AppInput label={t('名称', 'Name')} value={name} onChange={setName} isRequired />
<AppNumber label={t('调用预算', 'Call budget')} value={budget} onChange={setBudget} min={3} max={8} />
<AppDialog title={title} closeLabel={t('关闭', 'Close')} onClose={close} busy={saving}>
  {form}
</AppDialog>
```

`AppTheme` owns light/dark tokens and vendor localization. `AppDialog` uses the
vendor native dialog; form dismissal is blocked while submitting. Icon-only
commands require a label and inherit its tooltip. Loading and disabled command
states use Astryx's accessible interaction guards. Input limits are visual
validation; the API schema remains authoritative.
Use `tooltip={false}` only for familiar, already named controls such as a dialog's
close button, where an autofocus tooltip would consume Escape before the dialog.
Keep the accessible label. `AppDataTable` accepts controlled sorting and real
pagination; `useAppTableRows` applies the same Astryx sort to mobile projections.
`AppSelect size="sm"` is available for result toolbars; its form default remains
`lg`. Responsive consumers use the wrapper hooks in `useViewport.ts`, not vendor
hooks scattered throughout product pages. Dialog focus restoration must target a
visible trigger when a result switches between desktop and mobile layouts.
`AppSegments iconOnly` uses Astryx `isLabelHidden` for items that have icons;
the accessible label remains intact. Keep controls without icons labelled.
Scope feature layout rules to owned classes such as `.wf-heading-content`, not
every direct `div` in a toolbar: vendor tooltip/popover roots can be siblings of
their trigger, and a generic display rule can accidentally reveal a closed layer.

Import `AppMarkdown` separately from `./Markdown` so its parser stays outside the
initial work-list path. It disables automatic images, relative links and non-HTTP(S)
links; absolute HTTP(S) links open only on user activation.

Verification: `tests/workbench-api.test.ts`, `tests/workbench-state.test.ts` and
`scripts/verify-workbench.mjs`; the latter checks real overlays, focus restoration,
keyboard dismissal, localized labels, narrow widths and both themes with a
disposable backend fixture.
