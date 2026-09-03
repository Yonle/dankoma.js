# Dankoma

High-performance Bilibili-style danmaku renderer with Mode 7 support.

Dankoma is a JavaScript danmaku renderer built around HTML Canvas. It supports scrolling, fixed-position, reverse-scrolling, and Mode 7 danmaku while providing timeline-based playback, JSONL loading, collision management, and rendering caches.

The renderer is divided into two main layers:

* **Public API** — methods intended to be called by applications.
* **Internal API** — methods used by Dankoma internally or for advanced integrations. Internal methods may change without preserving compatibility.

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
* [Public API](#public-api)

  * [`updateConfig()`](#updateconfig)
  * [`trackVideo()`](#trackvideo)
  * [`untrackVideo()`](#untrackvideo)
  * [`hide()`](#hide)
  * [`unhide()`](#unhide)
  * [`destroy()`](#destroy)
  * [`clearDanmakus()`](#cleardanmakus)
  * [`resetDanmakuData()`](#resetdanmakudata)
  * [`appendDanmaku()`](#appenddanmaku)
  * [`loadDanmaJSONL()`](#loaddanmajjsonl)
  * [`readTextStream()`](#readtextstream)
  * [`parseJSONL()`](#parsejsonl)
* [JSONL Record Format](#jsonl-record-format)
* [Danmaku Modes](#danmaku-modes)
* [Mode 7](#mode-7)

  * [Mode 7 Payload](#mode-7-payload)
  * [Mode 7 Coordinate System](#mode-7-coordinate-system)
* [Internal API](#internal-api)

  * [`emitDanmaku()`](#emitdanmaku)
  * [`seekDanmaku()`](#seekdanmaku)
  * [`updateDanmaku()`](#updatedanmaku)
  * [`createComment()`](#createcomment)
  * [`createScrollComment()`](#createscrollcomment)
  * [`createFixedComment()`](#createfixedcomment)
  * [`removeComment()`](#removecomment)
  * [`rebuildLanes()`](#rebuildlanes)
  * [`findCenterLane()`](#findcenterlane)
  * [`canUseCenterLane()`](#canusecenterlane)
  * [`willScrollCollide()`](#willscrollcollide)
  * [`drawDanmaFrame()`](#drawdanmaframe)
  * [`drawComment()`](#drawcomment)
  * [`createMode7()`](#createmode7)
  * [`mode7_frame()`](#mode7_frame)
  * [`drawMode7()`](#drawmode7)
  * [`mode7frameDanma()`](#mode7framedanma)
  * [`buildMode7Sprite()`](#buildmode7sprite)
  * [`getMode7Sprite()`](#getmode7sprite)
  * [`getMode7RenderedSprite()`](#getmode7renderedsprite)
  * [`getMetrics()`](#getmetrics)
  * [`createSprite()`](#createsprite)
  * [`getSprite()`](#getsprite)
  * [`fontFor()`](#fontfor)
  * [`speedFor()`](#speedfor)
  * [`resize()`](#resize)
* [Pure Helper Functions](#pure-helper-functions)

  * [`number()`](#number)
  * [`degree()`](#degree)
  * [`parseOpacity()`](#parseopacity)
  * [`parseCoordinate()`](#parsecoordinate)
  * [`mode7_ease()`](#mode7_ease)
  * [`rgbaFromRGB888()`](#rgbafromrgb888)
  * [`makeCanvas()`](#makecanvas)
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

# Usage

```js
const canvas = document.getElementById("danmaku");
const video = document.querySelector("video");

const dankoma = new Dankoma(canvas, {
    laneHeight: 32,
    dpr: 1.5,
});

dankoma.trackVideo(video);
```

Danmaku can be loaded from a JSONL resource:

```js
await dankoma.loadDanmaJSONL("/danmaku.jsonl");
```

Additional JSONL sources can be loaded later. Loaded records are appended to the existing danmaku dataset.

The JSONL processing pipeline is:

```text
URL / Blob
    │
    ▼
fetch()
    │
    ▼
Response.body
    │
    ▼
readTextStream()
    │
    ▼
parseJSONL()
    │
    ▼
appendDanmaku()
    │
    ▼
danmaku + timeline
```

`readTextStream()` is deliberately independent of JSONL parsing. This allows the text-reading stage to be reused with other text-based formats or streams.

---

# Constructor

```js
new Dankoma(canvas, config?)
```

Creates a new Dankoma renderer.

### Parameters

| Parameter | Type                | Description                      |
| --------- | ------------------- | -------------------------------- |
| `canvas`  | `HTMLCanvasElement` | Canvas used for rendering.       |
| `config`  | `Object`            | Optional renderer configuration. |

The renderer automatically installs a window resize listener and starts its rendering loop.

---

# Configuration

The default configuration is:

```js
{
    laneHeight: 32,
    dpr: 1,

    fonts: {
        scroll: 32,
        fixed: 32,
        weight: 500,
        family: `"SimHei", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`,
    },

    style: {
        opacity: 0.8,
    },

    scroll: {
        duration: 8.5,
        lookahead: 4,
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

The available vertical rendering area is divided into lanes using this value.

---

## `dpr`

Device-pixel-ratio multiplier used when creating sprites and the rendering surface.

```js
dpr: 1.5
```

Higher values can improve sprite quality at the cost of additional memory and rendering work.

The renderer's actual canvas DPR is also capped at `2`.

---

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
| `weight` | Font weight for standard danmaku. |
| `family` | CSS font family.                  |

---

## `style`

General rendering style.

```js
style: {
    opacity: 0.8,
}
```

`opacity` controls the alpha applied to standard danmaku.

---

## `scroll`

Scrolling danmaku behavior.

```js
scroll: {
    duration: 6.5,
    lookahead: 8,
    gap: 2,
}
```

| Property    | Description                                                |
| ----------- | ---------------------------------------------------------- |
| `duration`  | Time in seconds for a comment to cross the rendering area. |
| `lookahead` | Collision scheduling lookahead in seconds.                 |
| `gap`       | Minimum spacing between scrolling comments.                |

---

## `fixed`

Configuration for top and bottom fixed danmaku.

```js
fixed: {
    lifetime: 5000,
}
```

`lifetime` specifies how long a fixed danmaku remains visible, in milliseconds.

---

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
| `outlineWidth` | Width of Mode 7 outlines.   |

---

# Public API

These methods are intended for application code.

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

Configuration objects are merged shallowly at each configuration section.

Only supplied properties need to be specified.

---

# `trackVideo()`

```js
dankoma.trackVideo(video)
```

Associates the renderer with an HTML video element.

The video's `currentTime` is used as the danmaku playback timeline.

```js
dankoma.trackVideo(video);
```

Calling this method starts the danmaku tracking loop if it is not already running.

---

# `untrackVideo()`

```js
dankoma.untrackVideo()
```

Stops tracking the currently associated video element.

The renderer itself remains usable.

---

# `hide()`

```js
dankoma.hide()
```

Disables danmaku rendering and clears the visible canvas.

Loaded danmaku data and timeline information are retained.

---

# `unhide()`

```js
dankoma.unhide()
```

Re-enables rendering.

The renderer resets its frame timestamp when becoming visible to prevent a large animation timestep.

---

# `destroy()`

```js
dankoma.destroy()
```

Releases renderer resources and removes installed event handlers.

This clears:

* Active comments
* Loaded danmaku data
* Timeline data
* Mode 7 state
* Rendering caches

After calling `destroy()`, the renderer should no longer be used.

---

# `clearDanmakus()`

```js
dankoma.clearDanmakus()
```

Clears currently active danmaku from the renderer.

This removes:

* Active scrolling danmaku
* Active top/bottom fixed danmaku
* Active Mode 7 danmaku

Loaded danmaku data and the playback timeline are retained.

```js
dankoma.clearDanmakus();
```

Use this when the visible rendering state needs to be flushed without unloading the dataset.

---

# `resetDanmakuData()`

```js
dankoma.resetDanmakuData()
```

Clears all loaded danmaku data and its playback timeline.

The playback cursor is also reset.

```js
dankoma.resetDanmakuData();
```

Unlike [`clearDanmakus()`](#cleardanmakus), this removes the loaded dataset itself.

---

# `appendDanmaku()`

```js
dankoma.appendDanmaku(danmaku)
```

Appends one danmaku record to the loaded dataset and creates its corresponding timeline entry.

```js
dankoma.appendDanmaku([
    "Hello world",
    12.5,
    1,
    0,
    16777215,
    500,
]);
```

The record is not sorted after insertion.

Applications that append records manually should therefore provide them in chronological order.

`appendDanmaku()` is also the final stage of the JSONL loading pipeline.

---

# `loadDanmaJSONL()`

```js
await dankoma.loadDanmaJSONL(source)
```

Loads danmaku from a JSONL resource.

`source` may be:

* A URL accepted by `fetch()`
* A `Blob`

When a `Blob` is supplied, Dankoma creates and later revokes a temporary object URL.

```js
await dankoma.loadDanmaJSONL("/danmaku.jsonl");
```

Or:

```js
const blob = new Blob([
    '["Hello",1,1,0,16777215,32]\n'
], {
    type: "application/jsonl",
});

await dankoma.loadDanmaJSONL(blob);
```

The loading pipeline is:

```text
source
  ↓
fetch()
  ↓
response.body
  ↓
readTextStream()
  ↓
parseJSONL()
  ↓
appendDanmaku()
```

Loaded records are appended to the existing dataset.

The timeline is **not sorted automatically**, so multiple sources should be loaded in chronological order.

### Memory behavior

`loadDanmaJSONL()` currently reads the complete decoded text before parsing it.

It therefore does **not** provide true record-by-record streaming JSONL parsing.

The underlying `ReadableStream` is consumed incrementally by [`readTextStream()`](#readtextstream), but the resulting text is accumulated into one string before [`parseJSONL()`](#parsejsonl) processes it.

This separation is intentional: stream decoding and JSONL parsing are independent public operations.

---

# `readTextStream()`

```js
await dankoma.readTextStream(stream)
```

Reads a text `ReadableStream` and returns its complete decoded contents as a string.

```js
const text = await dankoma.readTextStream(response.body);
```

The stream is passed through `TextDecoderStream`, allowing UTF-8 text to be decoded correctly across stream chunk boundaries.

Conceptually:

```text
ReadableStream<Uint8Array>
        │
        ▼
TextDecoderStream
        │
        ▼
ReadableStream<string>
        │
        ▼
complete String
```

This method does not perform JSON parsing.

It can therefore be used with arbitrary text-based streams.

---

# `parseJSONL()`

```js
dankoma.parseJSONL(text, onComment)
```

Parses a complete JSONL string and invokes `onComment` once for every non-empty line.

```js
dankoma.parseJSONL(text, comment => {
    console.log(comment);
});
```

Each line is parsed independently using `JSON.parse()`.

Empty or whitespace-only lines are ignored.

The callback receives the parsed JavaScript value:

```js
dankoma.parseJSONL(
    '["Hello",1,1,0,16777215,32]\n',
    comment => {
        console.log(comment);
    }
);
```

`parseJSONL()` expects the complete text as a string. It does not itself consume a `ReadableStream`.

---

# JSONL Record Format

A standard danmaku record has the following structure:

```text
[text, time, mode, timestamp, color, weight]
```

| Index | Field       | Description                             |
| ----: | ----------- | --------------------------------------- |
|   `0` | `text`      | Danmaku content.                        |
|   `1` | `time`      | Display time in seconds.                |
|   `2` | `mode`      | Danmaku rendering mode.                 |
|   `3` | `timestamp` | Source timestamp.                       |
|   `4` | `color`     | RGB color value.                        |
|   `5` | `weight`    | Font-size-related value used by Mode 7. |

For standard danmaku, the renderer currently uses its configured font weight rather than the record's `weight` field.

For Mode 7, `record[5]` is used as the Mode 7 font size.

---

# Danmaku Modes

Dankoma supports the following modes:

| Mode | Type                    |
| ---: | ----------------------- |
|  `1` | Scrolling right-to-left |
|  `2` | Scrolling right-to-left |
|  `3` | Scrolling right-to-left |
|  `4` | Bottom fixed            |
|  `5` | Top fixed               |
|  `6` | Reverse scrolling       |
|  `7` | Mode 7                  |

Modes `1`, `2`, and `3` currently share the same scrolling implementation.

Mode `6` uses the same scrolling renderer with reversed horizontal velocity.

---

# Mode 7

Mode 7 danmaku uses an extended payload stored in the first field of the standard record.

The payload describes properties such as:

* Position
* Opacity
* Lifetime
* Movement
* Easing
* Rotation
* Font configuration
* Outline configuration

Mode 7 supports both normalized and pixel-based coordinates.

---

## Mode 7 Payload

A Mode 7 payload is encoded as a JSON array.

The current extended payload format is:

```text
[
    x1,
    y1,
    opacity,
    lifetime,
    text,
    zRotation,
    yRotation,
    x2,
    y2,
    moveDuration,
    delay,
    outline,
    fontFamily,
    linear
]
```

| Index | Field          | Description                                                   |
| ----: | -------------- | ------------------------------------------------------------- |
|   `0` | `x1`           | Initial horizontal position.                                  |
|   `1` | `y1`           | Initial vertical position.                                    |
|   `2` | `opacity`      | Initial/final opacity. Can be a number or `"from-to"` string. |
|   `3` | `lifetime`     | Display lifetime in seconds.                                  |
|   `4` | `text`         | Text to render.                                               |
|   `5` | `zRotation`    | Rotation around the Z axis, in degrees.                       |
|   `6` | `yRotation`    | Perspective rotation around the Y axis, in degrees.           |
|   `7` | `x2`           | Final horizontal position.                                    |
|   `8` | `y2`           | Final vertical position.                                      |
|   `9` | `moveDuration` | Movement duration in milliseconds.                            |
|  `10` | `delay`        | Movement delay in milliseconds.                               |
|  `11` | `outline`      | Enables the Mode 7 outline when truthy.                       |
|  `12` | `fontFamily`   | Font family used for the text.                                |
|  `13` | `linear`       | Uses linear movement interpolation when truthy.               |

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

A complete Mode 7 record is:

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

The final `32` becomes the Mode 7 font size.

### Legacy payloads

Mode 7 also accepts payloads containing fewer than 14 fields.

Legacy payloads:

* Use the initial position for both start and end positions.
* Do not perform movement.
* Do not perform rotation.
* Use the configured default font.
* Do not enable an outline.

---

## Mode 7 Coordinate System

Coordinates can be specified using normalized values or pixel values.

Values between `0` and `1` are interpreted as normalized coordinates relative to the current rendering surface.

For example:

```text
x = 0.5
y = 0.5
```

places the object at the center of the rendering area.

Values outside the normalized range are interpreted as pixel coordinates.

---

# Internal API

The following methods are used by Dankoma internally.

They are documented for contributors and advanced users, but applications should generally prefer the public API.

Internal implementation details may change between versions.

---

# `emitDanmaku()`

```js
dankoma.emitDanmaku(comment)
```

Dispatches a parsed danmaku record to the appropriate renderer.

The mode determines which renderer is created:

```text
1 / 2 / 3 → scrolling
4         → bottom fixed
5         → top fixed
6         → reverse scrolling
7         → Mode 7
```

Mode 7 creation is wrapped in error handling so malformed Mode 7 records do not terminate the normal danmaku update loop.

---

# `seekDanmaku()`

```js
dankoma.seekDanmaku(time)
```

Moves the internal playback cursor to the first timeline entry whose timestamp is greater than or equal to `time`.

The timeline is searched using binary search.

This requires the timeline to remain sorted by timestamp.

---

# `updateDanmaku()`

```js
dankoma.updateDanmaku(currentTime)
```

Updates the active danmaku state according to the supplied video time.

For every timeline entry whose timestamp has been reached, `emitDanmaku()` is called.

Large playback jumps are detected automatically. When the difference from the previous video time exceeds one second, the timeline cursor is reseeked and currently active standard comments are cleared.

This handles operations such as:

* Seeking forward.
* Seeking backward.
* Large playback jumps.

---

# `createComment()`

```js
dankoma.createComment(text, mode, color, reverse)
```

Internal dispatcher for standard danmaku creation.

It selects either:

* `createScrollComment()`
* `createFixedComment()`

depending on the requested mode.

---

# `createScrollComment()`

```js
dankoma.createScrollComment(text, color, reverse)
```

Creates a scrolling or reverse-scrolling comment.

The method:

1. Obtains cached text metrics.
2. Obtains or creates a sprite.
3. Calculates scrolling velocity.
4. Finds a suitable center lane.
5. Adds the comment to the active comment list.
6. Registers it with the selected lane.

Reverse scrolling uses negative horizontal velocity.

---

# `createFixedComment()`

```js
dankoma.createFixedComment(text, mode, color)
```

Creates a top or bottom fixed comment.

The method selects an available lane.

If every lane is occupied, it selects the lane whose occupancy ends soonest.

Fixed comments remain visible for `config.fixed.lifetime` milliseconds.

---

# `removeComment()`

```js
dankoma.removeComment(index)
```

Removes an active standard comment and cleans up its scrolling-lane reference when necessary.

---

# `rebuildLanes()`

```js
dankoma.rebuildLanes()
```

Recreates lane state based on the current canvas height and active comments.

It is used after operations such as:

* Canvas resizing.
* Clearing comments.
* Seeking.
* Resetting rendering state.

Separate lane collections are maintained for:

* Top fixed comments.
* Bottom fixed comments.
* Scrolling comments.

---

# `findCenterLane()`

```js
dankoma.findCenterLane(width, height, vx)
```

Finds a suitable scrolling lane.

The renderer first searches for a collision-free lane.

If all lanes are occupied, the least populated lane is selected as a fallback.

This allows comments to continue entering the screen even when every lane is busy.

---

# `canUseCenterLane()`

```js
dankoma.canUseCenterLane(width, height, vx, laneIndex)
```

Checks whether a scrolling comment can safely enter a particular lane.

The candidate's initial position depends on its direction:

* Normal scrolling starts at the right edge.
* Reverse scrolling starts at the left edge.

Existing comments in the lane are checked using `willScrollCollide()`.

---

# `willScrollCollide()`

```js
dankoma.willScrollCollide(a, b)
```

Determines whether two scrolling comments are likely to collide.

The test considers:

* Vertical overlap.
* Horizontal spacing.
* Scroll direction.
* Relative velocity.
* Configured collision lookahead.

Comments moving in opposite directions are considered immediately conflicting when their vertical regions overlap.

---

# `drawDanmaFrame()`

```js
dankoma.drawDanmaFrame(now)
```

Updates and renders active standard comments for one animation frame.

For scrolling comments it:

* Advances horizontal position.
* Removes comments that have left the visible area.
* Draws surviving comments.

For fixed comments it:

* Checks their lifetime.
* Removes expired comments.
* Draws surviving comments.

The active comment array is replaced once per frame with the surviving comments.

---

# `drawComment()`

```js
dankoma.drawComment(comment)
```

Draws a cached standard danmaku sprite onto the main canvas.

The sprite is positioned using its stored anchor point.

---

# `createMode7()`

```js
dankoma.createMode7(record)
```

Parses a Mode 7 record and converts its payload into an internal Mode 7 object.

It handles:

* Payload parsing.
* Legacy payload compatibility.
* Coordinate conversion.
* Opacity parsing.
* Movement configuration.
* Rotation.
* Font selection.
* Outline configuration.

The resulting object is stored in `activeMode7` when emitted.

---

# `mode7_frame()`

```js
dankoma.mode7_frame(danmaku, time)
```

Calculates the state of a Mode 7 object at a specific playback time.

The returned state contains:

```js
{
    x,
    y,
    opacity,
    zRotation,
    yRotation,
    movementProgress,
    lifetimeProgress,
}
```

Movement progress is interpolated between the configured start and end positions.

The configured easing function is then applied unless linear interpolation is enabled.

---

# `drawMode7()`

```js
dankoma.drawMode7(danmaku, time)
```

Renders one Mode 7 object.

It:

1. Calculates its current frame state.
2. Obtains the appropriate cached sprite.
3. Applies position.
4. Applies Z rotation.
5. Applies opacity.
6. Draws the sprite.

Returns `false` when the Mode 7 object has expired.

---

# `mode7frameDanma()`

```js
dankoma.mode7frameDanma(currentTime)
```

Renders all active Mode 7 objects for the current video time.

Expired objects are removed from `activeMode7`.

---

# `buildMode7Sprite()`

```js
dankoma.buildMode7Sprite(danmaku)
```

Creates the base rasterized sprite for a Mode 7 text object.

The method:

* Measures every text line.
* Calculates sprite dimensions.
* Applies font configuration.
* Draws optional outlines.
* Renders the text at the configured sprite DPR.

The returned sprite contains the canvas and logical dimensions.

---

# `getMode7Sprite()`

```js
dankoma.getMode7Sprite(danmaku)
```

Returns a cached base Mode 7 sprite.

If no matching sprite exists, `buildMode7Sprite()` creates it and stores it in the Mode 7 sprite cache.

---

# `getMode7RenderedSprite()`

```js
dankoma.getMode7RenderedSprite(danmaku)
```

Returns the perspective-transformed Mode 7 sprite.

When Y rotation is zero, the original sprite is returned directly.

For rotated Mode 7 objects, the text is transformed using a sliced perspective projection.

Rotation values are quantized to `0.5°` increments for caching.

The transformed sprite is cached according to the source sprite and transformation parameters.

---

# `fontFor()`

```js
dankoma.fontFor(fixed)
```

Returns the CSS font declaration used by standard danmaku.

The font size is selected from either:

* `config.fonts.scroll`
* `config.fonts.fixed`

depending on `fixed`.

---

# `getMetrics()`

```js
dankoma.getMetrics(text, fixed)
```

Measures text using the configured font.

The resulting metrics are cached.

The returned object contains:

```js
{
    font,
    width,
    ascent,
    descent,
    height,
}
```

---

# `createSprite()`

```js
dankoma.createSprite(text, fixed, color)
```

Creates a rasterized sprite for standard danmaku text.

The sprite includes padding for the text outline and stores anchor information used during rendering.

---

# `getSprite()`

```js
dankoma.getSprite(text, fixed, color)
```

Returns a cached standard danmaku sprite.

If the requested combination of text, mode, and color has not previously been rendered, `createSprite()` creates it.

---

# `speedFor()`

```js
dankoma.speedFor(width)
```

Calculates horizontal scrolling velocity from:

```text
(canvas width + comment width) / duration
```

This ensures the comment takes approximately the configured scrolling duration to travel completely across the rendering area.

---

# `resize()`

```js
dankoma.resize()
```

Updates rendering dimensions and DPR when the viewport changes.

It:

* Reads `window.devicePixelRatio`.
* Caps the rendering DPR at `2`.
* Updates canvas dimensions.
* Updates canvas CSS dimensions.
* Resets the Mode 7 transformed-sprite cache.
* Rebuilds lane state.

Mode 7 transformations depend on the rendering width, so transformed sprites are invalidated after resizing.

---

# Pure Helper Functions

These functions are stateless utilities used by the renderer.

They do not depend on a `Dankoma` instance.

---

# `number()`

```js
number(value, fallback = 0)
```

Converts a value to a finite JavaScript number.

If conversion produces a non-finite value, `fallback` is returned.

```js
number("123");       // 123
number("invalid");   // 0
number("invalid", 5); // 5
```

---

# `degree()`

```js
degree(value)
```

Converts degrees to radians.

```js
degree(180); // Math.PI
```

Used for Mode 7 rotations and camera calculations.

---

# `parseOpacity()`

```js
parseOpacity(value)
```

Converts a Mode 7 opacity value into a normalized `{ from, to }` object.

A numeric value produces identical start and end opacity:

```js
parseOpacity(0.8);

// { from: 0.8, to: 0.8 }
```

A range can be specified as:

```js
parseOpacity("1-0");

// { from: 1, to: 0 }
```

Values are clamped to the range `0..1`.

---

# `parseCoordinate()`

```js
parseCoordinate(value, axisSize)
```

Converts normalized coordinates to pixels.

Values between `0` and `1` are multiplied by `axisSize`.

Other values are interpreted directly as pixels.

```js
parseCoordinate(0.5, 1920);
// 960
```

---

# `mode7_ease()`

```js
mode7_ease(t, linear)
```

Clamps interpolation progress to `0..1` and applies Mode 7 movement easing.

When `linear` is truthy, progress is unchanged.

Otherwise, the renderer uses quadratic ease-out interpolation.

---

# `rgbaFromRGB888()`

```js
rgbaFromRGB888(color, alpha = 1)
```

Converts a packed RGB888 integer into a CSS `rgba()` string.

```js
rgbaFromRGB888(0xff0000);

// "rgba(255, 0, 0, 1)"
```

---

# `makeCanvas()`

```js
makeCanvas(width, height)
```

Creates a canvas suitable for off-screen rendering.

`OffscreenCanvas` is preferred when available.

Otherwise, a normal `<canvas>` element is created.

This is primarily used for sprite generation.

---

# Rendering Architecture

Dankoma separates data loading, scheduling, state management, and rendering.

The main data flow is:

```text
JSONL
  │
  ▼
parseJSONL()
  │
  ▼
appendDanmaku()
  │
  ├── danmaku[]
  │
  └── timeline[]
          │
          ▼
   updateDanmaku()
          │
          ▼
    emitDanmaku()
          │
     ┌────┴────┐
     ▼         ▼
 Standard     Mode 7
 comments    comments
     │         │
     ▼         ▼
drawDanmaFrame()
mode7frameDanma()
     │         │
     └────┬────┘
          ▼
        Canvas
```

Video tracking and rendering are handled by separate animation loops:

```text
Video currentTime
       │
       ▼
trackDanma()
       │
       ▼
updateDanmaku()
```

while:

```text
requestAnimationFrame
       │
       ▼
danmaFrame()
       │
       ├── drawDanmaFrame()
       │
       └── mode7frameDanma()
```

This keeps timeline processing separate from visual frame rendering.

---

# Sprite Cache

Standard danmaku text is rasterized into reusable sprites.

The renderer maintains caches for:

* Text metrics.
* Standard text sprites.

Repeated instances of the same text/color/font combination can therefore reuse an existing canvas instead of repeatedly invoking `fillText()` and `strokeText()`.

---

# Mode 7 Render Cache

Mode 7 uses multiple levels of caching.

### Base sprite cache

Stores rasterized Mode 7 text.

The cache key includes properties such as:

* Text.
* Font size.
* Font family.
* Font weight.
* Color.
* Outline configuration.
* Sprite DPR.

### Perspective transformation cache

Stores Y-rotated versions of the base sprite.

The transformed representation depends on:

* Quantized Y rotation.
* Rendering width.
* Slice count.

A `WeakMap` associates transformed caches with their source sprites.

The transformed cache is invalidated when the rendering size changes.

---

# Collision Management

Scrolling danmaku are assigned to center lanes.

Each lane stores the active scrolling comments currently occupying it.

When a new comment enters:

1. Dankoma searches for a collision-free lane.
2. Existing comments are checked for vertical and horizontal conflicts.
3. The configured lookahead is used when comments have compatible directions and velocities.
4. If no safe lane exists, the least occupied lane is selected.

Fixed comments use independent top and bottom lane collections.

Each fixed lane tracks when it becomes available again.

---

# Performance Characteristics

Dankoma is designed to minimize expensive operations during animation frames.

The primary mechanisms are:

* Timeline-driven playback.
* Binary-search seeking.
* Cached text metrics.
* Cached standard sprites.
* Cached Mode 7 sprites.
* Cached perspective transformations.
* Lane-based collision management.
* Reuse of rasterized text.

Expensive text rendering and Mode 7 perspective transformations generally happen when a new cache entry is required.

Normal animation frames primarily perform:

* Position updates.
* Lifetime checks.
* Canvas clearing.
* `drawImage()` calls.
* Lightweight collision/state management.

### JSONL loading

The current JSONL pipeline decodes the stream progressively but accumulates the decoded text into a single string before parsing:

```text
ReadableStream
    ↓
TextDecoderStream
    ↓
complete text string
    ↓
split("\n")
    ↓
JSON.parse()
```

Therefore memory usage for the loading stage is approximately proportional to the size of the JSONL text being loaded.

This design intentionally keeps `readTextStream()` and `parseJSONL()` independent and reusable.

---

# Browser Requirements

Dankoma requires a browser environment supporting:

* HTML Canvas
* `requestAnimationFrame`
* `Map`
* `WeakMap`
* `ReadableStream`
* `TextDecoderStream`

`OffscreenCanvas` is optional.

When `OffscreenCanvas` is unavailable, Dankoma falls back to a normal HTML canvas for off-screen sprite rendering.

---

# Design Notes

## Timeline-driven playback

Danmaku scheduling is based on the associated video's `currentTime`.

This keeps danmaku synchronized with media playback rather than wall-clock time.

---

## Ordered timeline

`appendDanmaku()` does not sort records.

The timeline therefore assumes records are appended chronologically.

This allows normal playback to advance through the timeline using a simple cursor.

When playback jumps significantly, `seekDanmaku()` uses binary search to locate the new cursor position.

---

## Separate stream decoding and parsing

The JSONL loader deliberately separates stream decoding from JSONL parsing.

```text
readTextStream()
```

is responsible only for converting a text stream into a string.

```text
parseJSONL()
```

is responsible only for converting JSONL text into JavaScript values.

```text
appendDanmaku()
```

is responsible only for inserting records into Dankoma's dataset and timeline.

This makes each stage independently reusable.

---

## Resolution independence

Rendering dimensions are recalculated when the viewport changes.

Mode 7 normalized coordinates are interpreted relative to the current rendering dimensions.

Perspective-transformed Mode 7 sprites are discarded after resizing because their projection depends on the rendering width.

---

## Active state versus loaded data

Dankoma maintains a distinction between loaded data and currently visible objects.

```text
Loaded data:
    danmaku[]
    timeline[]

Active rendering state:
    comments[]
    activeMode7
    lane state
```

`clearDanmakus()` clears active rendering state while preserving loaded data.

`resetDanmakuData()` clears the loaded dataset as well.

---

# Public API Summary

| Method               | Description                                   |
| -------------------- | --------------------------------------------- |
| `updateConfig()`     | Update renderer configuration.                |
| `trackVideo()`       | Track a video element.                        |
| `untrackVideo()`     | Stop tracking the video.                      |
| `hide()`             | Disable rendering.                            |
| `unhide()`           | Re-enable rendering.                          |
| `destroy()`          | Release renderer resources.                   |
| `clearDanmakus()`    | Clear currently active danmaku.               |
| `resetDanmakuData()` | Clear loaded danmaku data and timeline.       |
| `appendDanmaku()`    | Append one danmaku record.                    |
| `loadDanmaJSONL()`   | Load and append danmaku from JSONL.           |
| `readTextStream()`   | Decode a text `ReadableStream` into a string. |
| `parseJSONL()`       | Parse JSONL text using a callback.            |

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

A Mode 7 record stores its extended payload as a JSON array in the first field:

```json
["[0.5,0.5,\"1-0\",4,\"Mode 7\",0,20,0.8,0.5,2000,0,1,\"Noto Sans\",0]",8.0,7,0,16777215,32]
```
