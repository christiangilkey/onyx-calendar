# MediaPipe Tasks Vision (vendored)

The camera presence check in Hyperfocus (`../presence.js`) uses Google's MediaPipe:

- `vision_bundle.js`, `vision_wasm_internal.js`, `vision_wasm_internal.wasm`: from
  [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) 1.1.1, Apache License 2.0.
- `selfie_segmenter.tflite`: the MediaPipe Selfie Segmenter model (float16), Apache License 2.0,
  from `storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/`.

## The one change made to it

Out of the box, MediaPipe Tasks sends usage reports (which task ran and how fast) to
`https://odml.pa.googleapis.com/v1/log` once a minute. In `vision_bundle.js` that logger is cut out:
its timer is never started, `flush()` drops whatever it held and returns before sending, and the
address is blanked. No pictures were ever part of those reports, but nothing at all leaves Onyx now.
`test/presence.test.js` fails if any `https://` address or the logger comes back.

As a second wall, the page the camera runs in (`../presence.html`) is allowed to load files from
Onyx itself and nothing else: no connection to any other address is possible from it.
