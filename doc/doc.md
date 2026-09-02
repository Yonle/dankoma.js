# Dankoma

High-performance Bilibili-style danmaku renderer with Mode 7 support.

Dankoma is a JavaScript danmaku renderer built around HTML Canvas. It supports scrolling, fixed-position, reverse-scrolling, and Mode 7 danmaku while providing timeline-based playback, incremental JSONL loading, collision management, and rendering caches.

## Table of Contents

* [Usage](#usage)
* [Constructor](#constructor)
* [Configuration](#configuration)

  * [`laneHeight`](#laneheight)
  * [`dpr`](#dpr)
  * [`fonts`](#fonts)
  * [`style`](#style)
  * [`scroll`](#scroll)
  * [`fixed`](#fixed)
  * [`mode7`](#mode7)
* [`updateConfig()`](#updateconfig)
* [`trackVideo()`](#trackvideo)
* [`untrackVideo()`](#untrackvideo)
* [`hide()`](#hide)
* [`unhide()`](#unhide)
* [`destroy()`](#destroy)
* [`loadDanmaJSONL()`](#loaddanmajjsonl)
* [JSONL Record Format](#jsonl-record-format)
* [Danmaku Modes](#danmaku-modes)
* [Mode 7](#mode-7)

  * [Mode 7 Payload](#mode-7-payload)
  * [Mode 7 Coordinate System](#mode-7-coordinate-system)
* [`emitDanmaku()`](#emitdanmaku)
* [`seekDanmaku()`](#seekdanmaku)
* [`updateDanmaku()`](#updatedanmaku)
* [Rendering Architecture](#rendering-architecture)
* [Sprite Cache](#sprite-cache)
* [Mode 7 Render Cache](#mode-7-render-cache)
* [Collision Management](#collision-management)
* [Performance Characteristics](#performance-characteristics)
* [Browser Requirements](#browser-requirements)
* [Design Notes](#design-notes)
* [Public API Summary](#public-api-summary)
* [Example Configuration](#example-configuration)
* [Example JSONL](#example-jsonl)

---

## Usage

```js
const canvas = document.getElementById("danmaku");

const dankoma = new Dankoma(canvas, {
    laneHeight: 32,
    dpr: 1.5,
});

dankoma.trackVideo(video);
```

Danmaku can then be loaded from a JSONL source:

```js
await dankoma.loadDanmaJSONL("/danmaku.jsonl");
```

---

## Constructor

```js
new Dankoma(canvas, config?)
```

### Parameters

| Parameter | Type                | Description                      |
| --------- | ------------------- | -------------------------------- |
| `canvas`  | `HTMLCanvasElement` | Canvas used for rendering.       |
| `config`  | `Object`            | Optional renderer configuration. |

---

# Configuration

The default configuration is:

```js
{
    laneHeight: 32,
    dpr: 1,

    fonts: {
        scroll: 28,
        fixed: 32,
        weight: 500,
        family: `"SimHei", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`,
    },

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

    mode7: {
        weight: 400,
        outlineWidth: 1,
    },
}
```

## `laneHeight`

Height of a standard danmaku lane in pixels.

```js
laneHeight: 32
```

## `dpr`

Device-pixel-ratio multiplier used when configuring the rendering surface.

```js
dpr: 1.5
```

## `fonts`

Font configuration for standard danmaku.

```js
fonts: {
    scroll: 28,
    fixed: 32,
    weight: 500,
    family: `"SimHei", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`,
}
```

| Property | Description                       |
| -------- | --------------------------------- |
| `scroll` | Font size for scrolling danmaku.  |
| `fixed`  | Font size for top/bottom danmaku. |
| `weight` | Font weight.                      |
| `family` | CSS font family.                  |

## `style`

General rendering style.

```js
style: {
    opacity: 0.8,
}
```

## `scroll`

Scrolling danmaku behavior.

```js
scroll: {
    duration: 6.5,
    lookahead: 8,
    gap: 2,
}
```

| Property    | Description                                 |
| ----------- | ------------------------------------------- |
| `duration`  | Default scrolling duration in seconds.      |
| `lookahead` | Scheduling lookahead in seconds.            |
| `gap`       | Minimum spacing between scrolling comments. |

## `fixed`

Configuration for top and bottom fixed danmaku.

```js
fixed: {
    lifetime: 5000,
}
```

`lifetime` specifies how long a fixed danmaku remains visible, in milliseconds.

## `mode7`

Configuration for Mode 7 danmaku.

```js
mode7: {
    weight: 400,
    outlineWidth: 1,
}
```

| Property       | Description                 |
| -------------- | --------------------------- |
| `weight`       | Default Mode 7 font weight. |
| `outlineWidth` | Default outline width.      |

---

# `updateConfig()`

```js
dankoma.updateConfig(config)
```

Updates renderer configuration.

```js
dankoma.updateConfig({
    style: {
        opacity: 0.9,
    },
});
```

Only supplied configuration properties need to be specified.

---

# `trackVideo()`

```js
dankoma.trackVideo(video)
```

Associates the renderer with an HTML video element.

The video provides the playback timeline used to schedule danmaku.

```js
dankoma.trackVideo(video);
```

---

# `untrackVideo()`

```js
dankoma.untrackVideo()
```

Stops tracking the currently associated video element.

---

# `hide()`

```js
dankoma.hide()
```

Disables danmaku rendering while retaining the loaded danmaku data and renderer state.

---

# `unhide()`

```js
dankoma.unhide()
```

Re-enables danmaku rendering.

---

# `destroy()`

```js
dankoma.destroy()
```

Releases renderer resources and removes installed event handlers.

After calling `destroy()`, the renderer should no longer be used.

---

# `loadDanmaJSONL()`

```js
await dankoma.loadDanmaJSONL(url)
```

Loads danmaku from a JSONL resource.

Each non-empty line represents one danmaku record.

The resource is processed incrementally rather than requiring the entire file to be loaded into memory before parsing.

Example:

```json
["Hello world", 1.25, 1, 0, 16777215, 500]
["Nice song", 2.50, 1, 0, 16711680, 500]
["Fixed comment", 4.00, 5, 0, 16777215, 500]
```

---

# JSONL Record Format

A standard danmaku record has the following structure:

```text
[text, time, mode, timestamp, color, weight]
```

| Index | Field       | Description              |
| ----: | ----------- | ------------------------ |
|   `0` | `text`      | Danmaku content.         |
|   `1` | `time`      | Display time in seconds. |
|   `2` | `mode`      | Danmaku rendering mode.  |
|   `3` | `timestamp` | Source timestamp.        |
|   `4` | `color`     | RGB color value.         |
|   `5` | `weight`    | Font weight.             |

---

# Danmaku Modes

Dankoma supports the following standard modes:

| Mode | Type                    |
| ---: | ----------------------- |
|  `1` | Scrolling right-to-left |
|  `2` | Scrolling right-to-left |
|  `3` | Scrolling right-to-left |
|  `4` | Bottom fixed            |
|  `5` | Top fixed               |
|  `6` | Reverse scrolling       |
|  `7` | Mode 7                  |

Modes `1`, `2`, and `3` currently share the standard scrolling renderer.

---

# Mode 7

Mode 7 danmaku uses an extended payload stored in the text field of the standard record.

The payload describes properties such as:

* Position
* Scale
* Rotation
* Opacity
* Lifetime
* Movement
* Easing
* Font configuration
* Outline configuration

Mode 7 supports both normalized and pixel-based coordinates.

---

## Mode 7 Payload

A Mode 7 payload is encoded as JSON.

Example:

```json
{
    "text": "Hello",
    "x": 0.5,
    "y": 0.5,
    "duration": 4,
    "zRotation": 0,
    "yRotation": 0
}
```

Supported properties include:

| Property       | Description                             |
| -------------- | --------------------------------------- |
| `text`         | Text to render.                         |
| `x`            | Horizontal position.                    |
| `y`            | Vertical position.                      |
| `duration`     | Display duration.                       |
| `delay`        | Initial movement delay.                 |
| `zRotation`    | Rotation around the Z axis.             |
| `yRotation`    | Perspective rotation around the Y axis. |
| `opacity`      | Constant or animated opacity.           |
| `font`         | Font family.                            |
| `weight`       | Font weight.                            |
| `outlineWidth` | Outline width.                          |
| `linear`       | Controls linear interpolation.          |

Additional fields may be present depending on the source format.

---

## Mode 7 Coordinate System

Coordinates can be specified using normalized values or pixel values.

Normalized coordinates are interpreted relative to the current rendering surface.

For example:

```text
x = 0.5
y = 0.5
```

places the object at the center of the rendering area.

Pixel coordinates are interpreted directly against the current canvas dimensions.

---

# `emitDanmaku()`

```js
dankoma.emitDanmaku(danmaku)
```

Adds a danmaku object to the active renderer.

This is useful for real-time or externally generated comments.

---

# `seekDanmaku()`

```js
dankoma.seekDanmaku(time)
```

Updates danmaku state for a new playback position.

Timeline lookup uses the sorted danmaku timestamps to locate the appropriate starting position.

---

# `updateDanmaku()`

```js
dankoma.updateDanmaku(time)
```

Updates active danmaku according to the current playback position.

The renderer determines which comments should be active and updates their positions, lifetimes, and animation state.

---

# Rendering Architecture

Dankoma separates scheduling, state updates, and rendering.

The main processing stages are:

```text
JSONL
  │
  ▼
Timeline
  │
  ▼
Danmaku scheduling
  │
  ▼
Active comments
  │
  ├── Standard modes
  │
  └── Mode 7
         │
         ▼
       Canvas
```

The timeline is sorted by display time, allowing new comments to be located efficiently during playback.

When playback moves backwards, a binary search is used to locate the corresponding timeline position.

---

# Sprite Cache

Standard danmaku text is rendered into reusable sprites.

Text measurement and sprite creation are cached so that repeated frames do not require text layout and rendering for every active comment.

The standard renderer maintains caches for:

* Text metrics
* Rendered sprites

A cached sprite can then be positioned using `drawImage()` during subsequent frames.

---

# Mode 7 Render Cache

Mode 7 has two levels of cached data.

### Source sprite cache

Stores the initial rendered representation of Mode 7 text.

### Transformed sprite cache

Stores perspective-transformed results for combinations of:

* Y rotation
* Focal length
* Slice count

The transformed cache uses a `WeakMap` associated with source sprites, allowing cached data to follow the lifetime of the corresponding source object.

---

# Collision Management

Scrolling danmaku are assigned to horizontal lanes.

The renderer tracks active comments and determines whether a new comment can enter a lane based on the positions and movement of existing comments.

Fixed danmaku use separate top and bottom lane state.

This prevents fixed comments from overlapping unnecessarily while allowing independent top and bottom placement.

---

# Performance Characteristics

The renderer is designed around minimizing repeated work during animation.

The primary mechanisms are:

* Sorted playback timeline
* Binary-search seeking
* Cached text metrics
* Cached standard sprites
* Cached Mode 7 sprites
* Cached perspective transformations
* Lane-based collision management
* Incremental JSONL parsing
* Lightweight per-frame position updates

Expensive operations are generally performed when a danmaku is created or when a new cached representation is required. Per-frame processing primarily updates active state and submits the resulting sprites for rendering.

---

# Browser Requirements

Dankoma requires a browser environment supporting:

* HTML Canvas
* `requestAnimationFrame`
* `WeakMap`
* `Map`
* `TextDecoderStream`
* `ReadableStream`
* `OffscreenCanvas` when available

`OffscreenCanvas` is optional. A normal canvas is used when it is unavailable.

---

# Design Notes

## Timeline-driven playback

Danmaku timing is based on the associated video's playback position.

This keeps comment scheduling synchronized with the media timeline rather than with wall-clock time.

## Cached rendering

Rendering data that does not change frequently is retained between frames.

This includes text measurements, generated sprites, and Mode 7 transformations.

## Resolution independence

Rendering dimensions are recalculated when the canvas size or configured DPR changes.

Mode 7 coordinates can therefore be interpreted relative to the current rendering surface.

## Incremental loading

JSONL data can be consumed progressively, allowing large danmaku datasets to be processed without first constructing one large JSON document.

---

# Public API Summary

| Method             | Description                    |
| ------------------ | ------------------------------ |
| `updateConfig()`   | Update renderer configuration. |
| `trackVideo()`     | Track a video element.         |
| `untrackVideo()`   | Stop tracking the video.       |
| `hide()`           | Disable rendering.             |
| `unhide()`         | Re-enable rendering.           |
| `destroy()`        | Release renderer resources.    |
| `loadDanmaJSONL()` | Load danmaku from JSONL.       |
| `emitDanmaku()`    | Add a danmaku to the renderer. |
| `seekDanmaku()`    | Seek the danmaku timeline.     |
| `updateDanmaku()`  | Update active danmaku state.   |

---

# Example Configuration

```js
const dankoma = new Dankoma(canvas, {
    laneHeight: 32,
    dpr: 1.5,

    fonts: {
        scroll: 28,
        fixed: 32,
        weight: 500,
        family: `"SimHei", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`,
    },

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

    mode7: {
        weight: 400,
        outlineWidth: 1,
    },
});
```

---

# Example JSONL

```json
["Hello world", 1.0, 1, 0, 16777215, 500]
["This is Dankoma", 2.5, 1, 0, 16776960, 500]
["Top comment", 4.0, 5, 0, 16777215, 500]
["Bottom comment", 6.0, 4, 0, 16777215, 500]
```

A Mode 7 record can store its extended payload in the first field:

```json
["{\"text\":\"Mode 7\",\"x\":0.5,\"y\":0.5,\"duration\":4}",8.0,7,0,16777215,500]
```
