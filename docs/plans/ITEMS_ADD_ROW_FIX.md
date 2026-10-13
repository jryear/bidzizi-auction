# Item-entry row layout — 2026-10-13

Zack's screenshot showed the Add action beyond the panel edge and a squeezed title field. The item-entry row reused the existing-item table's selection, grip, number, photo and status columns. The creation controls now use a wrapping flex layout for title, category, provider, starting amount and Add. The title takes available space, controls align at 42px, and phone layouts put title/provider on their own lines. The layout does not depend on container-query support.

Only `src/app/studio/items.css` changes application behavior. The entry, Enter-to-add, pending/retry, live hidden-item and save rules are unchanged.

Compiled-build Chromium and WebKit layout checks cover 390, 768, 1080, 1120, 1200, 1268, 1440 and 1920px. The Add action stays 16px inside the panel; the title placeholder fits at all checked widths. The previous 768px layout squeezed the title to 150px, narrower than its 161px placeholder. Existing Items browser journeys pass **15/15**; the compatibility gate has zero findings; TypeScript/production build pass.

| | Before | After |
|---|---|---|
| Phone | [390px](../evidence/items-add-row-20261013/before-390.png) | [390px](../evidence/items-add-row-20261013/after-390.png) |
| Desktop | [1268px](../evidence/items-add-row-20261013/before-1268.png) | [1268px](../evidence/items-add-row-20261013/after-1268.png) |

Metrics and regression output are in the same evidence directory. Captures use a disposable local practice fixture; they do not claim an exact reproduction of Zack's browser configuration. This follow-up is intended for staging review; production remains on the compatibility release `3f6c3e2` until separately updated.

## Staging delivery

Live at **https://staging.bidzizi.com/studio**, source `9b255db`, deployment `dpl_AaZBntgxAR4Pu5UNvRktzMbJHKVU`. Hosted checks repeat the eight widths and verify Add saves a $125 item through the server. The separate practice fixture was deleted and the temporary smoke staff disabled afterward. [Hosted phone](../evidence/items-add-row-20261013/hosted-390.png) · [hosted desktop](../evidence/items-add-row-20261013/hosted-1268.png). Production remains on `dpl_CqZBiNowAAHiXFE8kXtmue27nrRq` / source `3f6c3e2`. No migrations or production changes in this layout follow-up.

## Helper text placement

Zack requested that the helper belong to the horizontal card, beneath all its fields. The helper/error text is now a full-width sibling after the controls, with an explicit final flex order on mobile. Chromium and WebKit compiled-layout checks pass at all eight widths; production build/typecheck pass. [Phone](../evidence/items-add-row-20261013/helper-390.png) · [desktop](../evidence/items-add-row-20261013/helper-1268.png).
