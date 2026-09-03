# Dankoma

[GitHub Repository](https://github.com/Yonle/dankoma.js) · [Documentation](doc/doc.md)

**High-performance Bilibili-style danmaku renderer with Mode 7 support.**

Dankoma is a JavaScript danmaku renderer built on HTML Canvas. It supports scrolling, fixed-position, reverse-scrolling, and Mode 7 danmaku, with timeline-based playback, JSONL loading, collision management, and rendering caches.

## Features

* Bilibili-style danmaku rendering
* Scrolling, top-fixed, bottom-fixed, and reverse-scrolling modes
* Mode 7 danmaku with:

  * Positioning
  * Movement
  * Easing
  * Rotation
  * Perspective transformation
  * Opacity animation
  * Font and outline configuration
* Video timeline synchronization
* JSONL loading and parsing
* `Blob` support for JSONL loading
* Cached text metrics and rendered sprites
* Cached Mode 7 transformations
* Lane-based collision management
* Device-pixel-ratio configuration
* `OffscreenCanvas` support when available

## Installation

Dankoma can be used directly in a browser environment.

```html
<canvas id="danmaku"></canvas>
<video></video>

<script src="https://cdn.jsdelivr.net/npm/dankoma.js@0.1.0"></script>
```

## Basic Usage

```js
const canvas = document.getElementById("danmaku");
const video = document.querySelector("video");

const dankoma = new Dankoma(canvas, {
    style: {
        opacity: 0.8,
    },

    scroll: {
        duration: 6.5,
        lookahead: 8,
        gap: 2,
    },

    fixed: {
        lifetime: 5000,
    },
});

dankoma.trackVideo(video);

await dankoma.loadDanmaJSONL("/danmaku.jsonl");
```

Once the video is playing, Dankoma follows its playback position and schedules the corresponding danmaku.

## JSONL Format

Dankoma accepts one danmaku record per line:

```json
["Hello world",1.0,1,0,16777215,500]
["Nice song",2.5,1,0,16776960,500]
["Top comment",4.0,5,0,16777215,500]
["Bottom comment",6.0,4,0,16777215,500]
```

The record format is:

```text
[text, time, mode, timestamp, color, weight]
```

Where `mode` determines the rendering behavior:

| Mode | Description       |
| ---: | ----------------- |
|  `1` | Scrolling         |
|  `2` | Scrolling         |
|  `3` | Scrolling         |
|  `4` | Bottom fixed      |
|  `5` | Top fixed         |
|  `6` | Reverse scrolling |
|  `7` | Mode 7            |

## Mode 7

Mode 7 records use an extended JSON array payload.

The payload format is:

```text
[x1, y1, opacity, lifetime, text, zRotation, yRotation,
 x2, y2, moveDuration, delay, outline, fontFamily, linear]
```

For example:

```json
[
    0.5,
    0.5,
    "1-0",
    4,
    "Hello Mode 7",
    0,
    20,
    0.8,
    0.5,
    2000,
    0,
    1,
    "Noto Sans",
    0
]
```

As a complete danmaku record:

```json
[
    "[0.5,0.5,\"1-0\",4,\"Hello Mode 7\",0,20,0.8,0.5,2000,0,1,\"Noto Sans\",0]",
    8.0,
    7,
    0,
    16777215,
    32
]
```

Mode 7 supports positioning, movement, easing, rotation, perspective effects, opacity animation, fonts, and outlines.

See the [Mode 7 specification](doc/doc.md#mode-7) for the complete format and supported fields.

## Loading Danmaku

JSONL data can be loaded from a URL or `Blob`:

```js
await dankoma.loadDanmaJSONL("/danmaku.jsonl");
```

`loadDanmaJSONL()` appends records to the existing danmaku dataset rather than replacing it.

The source may be either a URL accepted by `fetch()` or a `Blob`:

```js
const blob = new Blob([
    '["Hello world",1.0,1,0,16777215,500]\n'
], {
    type: "application/jsonl",
});

await dankoma.loadDanmaJSONL(blob);
```

When a `Blob` is supplied, Dankoma creates a temporary object URL internally and loads the JSONL from it.

For manually adding individual records, use:

```js
dankoma.appendDanmaku([
    "Hello world",
    10.0,
    1,
    0,
    16777215,
    500,
]);
```

For lower-level stream handling, `readTextStream()` and `parseJSONL()` are also available:

```js
const text = await dankoma.readTextStream(stream);

dankoma.parseJSONL(text, comment => {
    dankoma.appendDanmaku(comment);
});
```

The stream is decoded first, then the resulting text is parsed as JSONL.

## Runtime API

### Video

```js
dankoma.trackVideo(video);
dankoma.untrackVideo();
```

Associates or removes the video used for timeline synchronization.

### Visibility

```js
dankoma.hide();
dankoma.unhide();
```

Temporarily disables or re-enables rendering.

### Danmaku Data

```js
dankoma.appendDanmaku(danmaku);

dankoma.clearDanmakus();
dankoma.resetDanmakuData();
```

`appendDanmaku()` adds a single record to the loaded dataset.

`clearDanmakus()` removes currently active danmaku while retaining the loaded dataset.

`resetDanmakuData()` removes the loaded danmaku data and resets the playback timeline.

### Configuration

```js
dankoma.updateConfig({
    style: {
        opacity: 0.9,
    },
});
```

Updates the renderer configuration.

### Cleanup

```js
dankoma.destroy();
```

Stops rendering and releases the renderer's resources.

## Rendering

Dankoma separates danmaku scheduling, state updates, and rendering.

Rendered text and Mode 7 transformations are cached where possible, while active danmaku are updated according to the current playback position.

The renderer also maintains lane state for scrolling and fixed-position danmaku to manage overlapping comments.

## Documentation

For the complete API reference, configuration details, JSONL format, Mode 7 specification, internal functions, and implementation notes:

**[Documentation](doc/doc.md)**

## License

See the repository's license file for licensing information.
