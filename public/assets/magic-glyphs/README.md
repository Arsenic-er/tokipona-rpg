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

Planned layout:

```text
public/assets/magic-glyphs/
  README.md
  v1/
    atlases/
    manifests/
```
