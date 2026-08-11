# Magic glyph runtime assets

This folder reserves the public game's runtime import boundary for magic
glyphs.

Only files promoted from the private
`tokipona-asset/export/approved/magic-glyphs/` pipeline may enter this folder.
Do not copy private font sources, enlarged review PNGs, GIF reviews, AI raw
outputs, rejected backgrounds, or unreviewed license material here.

Runtime contract:

- atlas pixels use integer coordinates and nearest-neighbor sampling;
- glyph identity is stored by canonical Latin `wordId`;
- runtime packages contain an atlas plus a machine-readable manifest;
- activation uses eight stepped brightness levels across the whole glyph;
- animation plays once and holds the final frame;
- element colors are supplied by palette manifests;
- source masks and provenance remain in the private asset repository.
- stone, wood, mud, and metal are runtime surface profiles, never baked into glyph atlases;
- the visible glyph formula is `glyphInkMask AND inscriptionSupportMask AND currentSolidMaterialMask`;
- `inscriptionSupportMask` is stored independently from the current material grid;
- destroying support removes the corresponding glyph pixels, while newly filled material does not inherit old inscription pixels;
- all surface composition stays on integer coordinates with binary masks and no soft bloom.

Planned layout:

```text
public/assets/magic-glyphs/
  README.md
  v1/
    atlases/
    manifests/
    surface-profiles/
```
