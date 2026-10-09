# Local QR encoder provenance

Project Nayuki QR Code generator, MIT licensed. Retrieved 2026-10-08 from the
author’s compiled JavaScript distribution:
https://www.nayuki.io/res/qr-code-generator-library/qrcodegen.js

Author documentation: https://www.nayuki.io/page/qr-code-generator-library
Upstream repository: https://github.com/nayuki/QR-Code-generator

Original retrieved bytes SHA-256:
`2511bc17f40a3c41d4a0578995db956b38997334d3d20113a5d4dc5c49c69480`

`qr-code.js` removes trailing whitespace on five upstream lines and adds a final
ES-module export for `qrcodegen`; the encoder implementation is otherwise unchanged. No runtime CDN or remote script is used. Studio paints actual encoder
modules with a four-module white quiet zone; QR content is the confirmed configured
origin and persisted event UUID. The preserved license is in `qr-code.LICENSE.txt`.
The frozen native evidence independently decodes rendered pixels using macOS Vision.
