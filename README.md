# Dankoma

[GitHub Repository](https://github.com/Yonle/dankoma.js) · [Documentation](doc/doc.md)

**High-performance Bilibili-style danmaku renderer with Mode 7 support.**

Dankoma is a JavaScript danmaku renderer built on HTML Canvas. It supports scrolling, fixed-position, reverse-scrolling, and Mode 7 danmaku, with timeline-based playback, JSONL streaming, collision management, and rendering caches.

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
* Incremental JSONL loading
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

<script src="https://cdn.jsdelivr.net/npm/dankoma.js@0.0.6"></script>
```

## Basic Usage

```js
const canvas = document.getElementById("danmaku");
const video = document.querySelector("video");

const dankoma = new Dankoma(canvas,
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

Mode 7 records use an extended JSON payload.

For example:

```json
["{\"text\":\"Hello\",\"x\":0.5,\"y\":0.5,\"duration\":4,\"yRotation\":25}",8.0,7,0,16777215,500]
```

Mode 7 supports positioning, animation, easing, rotation, perspective effects, opacity, fonts, and outlines.

## Loading Large Danmaku Files

JSONL data is consumed incrementally:

```js
await dankoma.loadDanmaJSONL("/danmaku.jsonl");
```

This allows large danmaku datasets to be processed progressively instead of requiring the entire JSON document to be parsed at once.

## Runtime API

```js
dankoma.trackVideo(video);
dankoma.untrackVideo();

dankoma.hide();
dankoma.unhide();

dankoma.emitDanmaku(danmaku);

dankoma.seekDanmaku(time);
dankoma.updateDanmaku(time);

dankoma.updateConfig({
    style: {
        opacity: 0.9,
    },
});

dankoma.destroy();
```

## Rendering

Dankoma separates danmaku scheduling, state updates, and rendering.

Rendered text and Mode 7 transformations are cached where possible, while active danmaku are updated according to the current playback position.

The renderer also maintains lane state for scrolling and fixed-position danmaku to manage overlapping comments.

## Documentation

For the complete API reference, configuration details, JSONL format, Mode 7 specification, rendering architecture, and implementation notes:

**[Documentation](doc/doc.md)**

## License

See the repository's license file for licensing information.
