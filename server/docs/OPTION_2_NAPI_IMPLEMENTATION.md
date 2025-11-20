# Option 2: N-API Native Addon Implementation

This document provides a detailed implementation guide for upgrading from the CLI wrapper (Option 1) to a high-performance N-API native addon (Option 2).

## Why Upgrade to N-API?

The CLI wrapper (Option 1) provides 5-10× performance improvement, but has overhead from:
- **Process spawning** (~50-100ms per call)
- **JSON serialization/deserialization** (~10-50ms depending on payload size)
- **Pipe communication** (stdin/stdout buffering)

An N-API native addon eliminates these overheads by:
- **In-process execution** (no spawn overhead)
- **Direct memory access** (no JSON serialization)
- **Synchronous or async calls** (your choice)

**Expected additional speedup**: 2-3× on top of Option 1, for **total 10-25× faster** than pure JavaScript.

## When to Implement Option 2

Consider upgrading to N-API when:
- ✅ Processing > 100 stickers per request
- ✅ High-frequency API calls (> 10 req/min)
- ✅ CLI spawn overhead becomes measurable bottleneck
- ✅ You need sub-second response times
- ✅ You're comfortable with C++ build toolchains in production

**Don't upgrade if**:
- ❌ Option 1 already meets your performance needs
- ❌ You want to minimize deployment complexity
- ❌ Your build environment doesn't support native compilation

## Architecture Comparison

### Option 1: CLI Wrapper (Current)
```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  Node.js    │  spawn  │   nest-packer│  JSON   │  Node.js    │
│  Backend    ├────────>│   (C++ CLI)  ├────────>│  Backend    │
│             │  JSON   │              │  stdout │             │
└─────────────┘         └──────────────┘         └─────────────┘
                             Process
                             Boundary
```

### Option 2: N-API Addon (Future)
```
┌──────────────────────────────────────────────┐
│            Node.js Process                   │
│  ┌─────────────┐         ┌──────────────┐  │
│  │  Node.js    │  native │  libnest2d   │  │
│  │  Backend    ├────────>│  (C++ addon) │  │
│  │             │  call   │              │  │
│  └─────────────┘         └──────────────┘  │
└──────────────────────────────────────────────┘
          In-Process (Zero-Copy)
```

## Implementation Steps

### Step 1: Project Setup

#### Install Dependencies
```bash
npm install --save-dev \
  node-addon-api \
  node-gyp \
  cmake-js
```

#### Create Directory Structure
```
server/cpp-addon/
├── binding.gyp          # Node-gyp build configuration
├── package.json         # Addon package configuration
├── CMakeLists.txt       # CMake build (alternative to binding.gyp)
├── src/
│   ├── addon.cpp        # N-API entry point
│   ├── packer.cpp       # Packer implementation
│   └── packer.h         # Packer interface
├── include/
│   └── libnest2d/       # libnest2d headers (git submodule)
└── test/
    └── test.js          # Unit tests
```

### Step 2: Create binding.gyp

```json
{
  "targets": [
    {
      "target_name": "nest_packer_addon",
      "sources": [
        "src/addon.cpp",
        "src/packer.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "include",
        "/usr/include",
        "/usr/local/include"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc": ["-std=c++17", "-O3", "-march=native"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "libraries": [
        "-lboost_system",
        "-lboost_thread",
        "-lpthread"
      ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          }
        }]
      ]
    }
  ]
}
```

### Step 3: Implement N-API Addon

#### src/packer.h
```cpp
#ifndef PACKER_H
#define PACKER_H

#include <vector>
#include <string>

namespace nest_packer {

struct Point {
    double x;
    double y;
};

struct Sticker {
    std::string id;
    std::vector<Point> points;
    double width;
    double height;
};

struct Placement {
    std::string id;
    double x;
    double y;
    int rotation;
};

struct PackResult {
    std::vector<Placement> placements;
    double utilization;
    int placedCount;
    int totalCount;
};

class Packer {
public:
    PackResult pack(
        const std::vector<Sticker>& stickers,
        double sheetWidth,
        double sheetHeight,
        double spacing,
        bool allowRotation
    );
};

} // namespace nest_packer

#endif // PACKER_H
```

#### src/packer.cpp
```cpp
#include "packer.h"
#include <libnest2d/libnest2d.hpp>
#include <algorithm>

using namespace libnest2d;

namespace nest_packer {

PackResult Packer::pack(
    const std::vector<Sticker>& stickers,
    double sheetWidth,
    double sheetHeight,
    double spacing,
    bool allowRotation
) {
    // Convert inputs to libnest2d types
    using Point = PointImpl;
    using Polygon = PolygonImpl;
    using Item = _Item<Polygon>;
    using Coord = TCoord<Point>;

    std::vector<Item> items;
    items.reserve(stickers.size());

    for (size_t i = 0; i < stickers.size(); ++i) {
        Polygon poly;
        for (const auto& p : stickers[i].points) {
            poly.addPoint(Point(
                static_cast<Coord>(p.x * 1000000.0),
                static_cast<Coord>(p.y * 1000000.0)
            ));
        }

        Item item(poly);
        item.binId(i);
        if (allowRotation) {
            item.markAsFixedRotation(false);
        }
        items.push_back(std::move(item));
    }

    // Sort by area (largest first)
    std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) {
        return a.area() > b.area();
    });

    // Configure and run packer
    using Placer = placers::_NofitPolyPlacer<Polygon>;
    using Selector = selections::_FirstFitSelection;

    auto bin = Box(
        static_cast<Coord>(sheetWidth * 1000000.0),
        static_cast<Coord>(sheetHeight * 1000000.0)
    );
    Coord spacingCoord = static_cast<Coord>(spacing * 1000000.0);

    Placer::Config placerConfig;
    placerConfig.rotations = allowRotation ?
        std::vector<Radians>{0.0, PI/2.0, PI, 3*PI/2.0} :
        std::vector<Radians>{0.0};
    placerConfig.accuracy = 1.0;
    placerConfig.alignment = Placer::Config::Alignment::CENTER;

    size_t binCount = nest(items, bin, spacingCoord,
                          NestConfig<Placer, Selector>()
                              .placer_config(placerConfig));

    // Extract results
    PackResult result;
    result.placedCount = 0;
    result.totalCount = stickers.size();

    for (size_t i = 0; i < items.size(); ++i) {
        const auto& item = items[i];
        if (item.binId() != BIN_ID_UNSET) {
            auto bbox = item.transformedShape().boundingBox();
            Point minCorner = bbox.minCorner();

            double rotation = item.rotation();
            int rotationDegrees = static_cast<int>(std::round(rotation * 180.0 / PI)) % 360;
            if (rotationDegrees < 0) rotationDegrees += 360;

            Placement p;
            p.id = stickers[i].id;
            p.x = static_cast<double>(getX(minCorner)) / 1000000.0;
            p.y = static_cast<double>(getY(minCorner)) / 1000000.0;
            p.rotation = rotationDegrees;

            result.placements.push_back(p);
            result.placedCount++;
        }
    }

    // Calculate utilization
    double totalArea = 0.0;
    for (const auto& p : result.placements) {
        auto it = std::find_if(stickers.begin(), stickers.end(),
                              [&](const Sticker& s) { return s.id == p.id; });
        if (it != stickers.end()) {
            totalArea += it->width * it->height;
        }
    }
    double sheetArea = sheetWidth * sheetHeight;
    result.utilization = (totalArea / sheetArea) * 100.0;

    return result;
}

} // namespace nest_packer
```

#### src/addon.cpp
```cpp
#include <napi.h>
#include "packer.h"

using namespace Napi;

// Helper: Convert JS object to Point
nest_packer::Point JSToPoint(const Object& obj) {
    return {
        obj.Get("x").ToNumber().DoubleValue(),
        obj.Get("y").ToNumber().DoubleValue()
    };
}

// Helper: Convert JS object to Sticker
nest_packer::Sticker JSToSticker(const Object& obj) {
    nest_packer::Sticker sticker;
    sticker.id = obj.Get("id").ToString().Utf8Value();
    sticker.width = obj.Get("width").ToNumber().DoubleValue();
    sticker.height = obj.Get("height").ToNumber().DoubleValue();

    Array points = obj.Get("points").As<Array>();
    for (uint32_t i = 0; i < points.Length(); ++i) {
        sticker.points.push_back(JSToPoint(points.Get(i).As<Object>()));
    }

    return sticker;
}

// Helper: Convert Placement to JS object
Object PlacementToJS(Env env, const nest_packer::Placement& p) {
    Object obj = Object::New(env);
    obj.Set("id", String::New(env, p.id));
    obj.Set("x", Number::New(env, p.x));
    obj.Set("y", Number::New(env, p.y));
    obj.Set("rotation", Number::New(env, p.rotation));
    return obj;
}

// Synchronous pack function
Object PackSync(const CallbackInfo& info) {
    Env env = info.Env();

    // Validate arguments
    if (info.Length() < 5) {
        TypeError::New(env, "Expected 5 arguments").ThrowAsJavaScriptException();
        return Object::New(env);
    }

    // Parse arguments
    Array stickersArray = info[0].As<Array>();
    double sheetWidth = info[1].ToNumber().DoubleValue();
    double sheetHeight = info[2].ToNumber().DoubleValue();
    double spacing = info[3].ToNumber().DoubleValue();
    bool allowRotation = info[4].ToBoolean().Value();

    // Convert stickers
    std::vector<nest_packer::Sticker> stickers;
    stickers.reserve(stickersArray.Length());
    for (uint32_t i = 0; i < stickersArray.Length(); ++i) {
        stickers.push_back(JSToSticker(stickersArray.Get(i).As<Object>()));
    }

    // Run packer
    nest_packer::Packer packer;
    auto result = packer.pack(stickers, sheetWidth, sheetHeight, spacing, allowRotation);

    // Convert result to JS
    Object jsResult = Object::New(env);
    jsResult.Set("placedCount", Number::New(env, result.placedCount));
    jsResult.Set("totalCount", Number::New(env, result.totalCount));
    jsResult.Set("utilization", Number::New(env, result.utilization));

    Array placements = Array::New(env, result.placements.size());
    for (size_t i = 0; i < result.placements.size(); ++i) {
        placements.Set(i, PlacementToJS(env, result.placements[i]));
    }
    jsResult.Set("placements", placements);

    return jsResult;
}

// Asynchronous pack worker
class PackWorker : public AsyncWorker {
public:
    PackWorker(const Function& callback,
               const std::vector<nest_packer::Sticker>& stickers,
               double sheetWidth, double sheetHeight,
               double spacing, bool allowRotation)
        : AsyncWorker(callback),
          stickers_(stickers), sheetWidth_(sheetWidth), sheetHeight_(sheetHeight),
          spacing_(spacing), allowRotation_(allowRotation) {}

    void Execute() override {
        nest_packer::Packer packer;
        result_ = packer.pack(stickers_, sheetWidth_, sheetHeight_, spacing_, allowRotation_);
    }

    void OnOK() override {
        Env env = Env();
        Object jsResult = Object::New(env);
        jsResult.Set("placedCount", Number::New(env, result_.placedCount));
        jsResult.Set("totalCount", Number::New(env, result_.totalCount));
        jsResult.Set("utilization", Number::New(env, result_.utilization));

        Array placements = Array::New(env, result_.placements.size());
        for (size_t i = 0; i < result_.placements.size(); ++i) {
            placements.Set(i, PlacementToJS(env, result_.placements[i]));
        }
        jsResult.Set("placements", placements);

        Callback().Call({env.Null(), jsResult});
    }

private:
    std::vector<nest_packer::Sticker> stickers_;
    double sheetWidth_, sheetHeight_, spacing_;
    bool allowRotation_;
    nest_packer::PackResult result_;
};

// Asynchronous pack function
void PackAsync(const CallbackInfo& info) {
    Env env = info.Env();

    // Validate arguments
    if (info.Length() < 6) {
        TypeError::New(env, "Expected 6 arguments").ThrowAsJavaScriptException();
        return;
    }

    // Parse arguments (same as sync)
    Array stickersArray = info[0].As<Array>();
    double sheetWidth = info[1].ToNumber().DoubleValue();
    double sheetHeight = info[2].ToNumber().DoubleValue();
    double spacing = info[3].ToNumber().DoubleValue();
    bool allowRotation = info[4].ToBoolean().Value();
    Function callback = info[5].As<Function>();

    // Convert stickers
    std::vector<nest_packer::Sticker> stickers;
    for (uint32_t i = 0; i < stickersArray.Length(); ++i) {
        stickers.push_back(JSToSticker(stickersArray.Get(i).As<Object>()));
    }

    // Queue worker
    auto* worker = new PackWorker(callback, stickers, sheetWidth, sheetHeight, spacing, allowRotation);
    worker->Queue();
}

// Module initialization
Object Init(Env env, Object exports) {
    exports.Set("packSync", Function::New(env, PackSync));
    exports.Set("packAsync", Function::New(env, PackAsync));
    return exports;
}

NODE_API_MODULE(nest_packer_addon, Init)
```

### Step 4: TypeScript Integration

#### server/src/services/napi-packer.service.ts
```typescript
import { Sticker, Placement, NestingResult } from './nesting.service';

// Dynamic import to handle optional addon
let addon: any = null;
try {
  addon = require('../../cpp-addon/build/Release/nest_packer_addon.node');
} catch (e) {
  console.warn('[N-API Packer] Addon not available:', e);
}

export class NAPIPackerService {
  private readonly enabled: boolean;

  constructor() {
    this.enabled = addon !== null;
  }

  isAvailable(): boolean {
    return this.enabled;
  }

  /**
   * Synchronous pack (blocks event loop)
   * Use for small jobs only (<10 stickers)
   */
  packSync(
    stickers: Sticker[],
    sheetWidth: number,
    sheetHeight: number,
    spacing: number,
    allowRotation: boolean
  ): NestingResult {
    if (!this.enabled) {
      throw new Error('N-API packer not available');
    }

    const result = addon.packSync(stickers, sheetWidth, sheetHeight, spacing, allowRotation);

    return {
      placements: result.placements,
      utilization: result.utilization,
      fitness: result.placements.reduce((sum: number, p: any) => {
        const s = stickers.find(s => s.id === p.id);
        return sum + (s ? s.width * s.height : 0);
      }, 0),
    };
  }

  /**
   * Asynchronous pack (non-blocking)
   * Preferred for large jobs (>10 stickers)
   */
  async packAsync(
    stickers: Sticker[],
    sheetWidth: number,
    sheetHeight: number,
    spacing: number,
    allowRotation: boolean
  ): Promise<NestingResult> {
    if (!this.enabled) {
      throw new Error('N-API packer not available');
    }

    return new Promise((resolve, reject) => {
      addon.packAsync(
        stickers,
        sheetWidth,
        sheetHeight,
        spacing,
        allowRotation,
        (err: Error | null, result: any) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              placements: result.placements,
              utilization: result.utilization,
              fitness: result.placements.reduce((sum: number, p: any) => {
                const s = stickers.find(s => s.id === p.id);
                return sum + (s ? s.width * s.height : 0);
              }, 0),
            });
          }
        }
      );
    });
  }
}
```

### Step 5: Build & Test

#### Build the Addon
```bash
cd server/cpp-addon
npm install
npm run build  # or: node-gyp rebuild
```

#### Test the Addon
```javascript
const addon = require('./build/Release/nest_packer_addon.node');

const stickers = [
  {
    id: 'test1',
    points: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}],
    width: 1.0,
    height: 1.0
  }
];

const result = addon.packSync(stickers, 12.0, 12.0, 0.0625, true);
console.log(result);
```

### Step 6: Update Dockerfile

```dockerfile
# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libboost-all-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Build N-API addon
WORKDIR /app/server/cpp-addon
RUN npm install
RUN npm run build

# Back to main server
WORKDIR /app/server
```

## Performance Expectations

| Implementation | Spawn Overhead | JSON Overhead | Pack Time | Total Time |
|----------------|---------------|---------------|-----------|------------|
| JS (Baseline)  | 0ms           | 0ms           | 850ms     | **850ms**  |
| CLI (Option 1) | 50ms          | 30ms          | 120ms     | **200ms**  |
| N-API (Option 2)| 0ms          | 0ms           | 120ms     | **120ms**  |

**Speedup**: Option 2 is ~1.7× faster than Option 1, **7× faster than JS overall**.

For larger jobs (50+ stickers), speedup can reach **10-25× vs JavaScript**.

## Production Considerations

### Pros
- ✅ Maximum performance (10-25× faster than JS)
- ✅ No process spawn overhead
- ✅ No JSON serialization overhead
- ✅ Can use async workers (non-blocking)

### Cons
- ❌ Complex build process (node-gyp, platform-specific)
- ❌ Harder to debug (need GDB/LLDB)
- ❌ Requires build tools in Docker
- ❌ Platform-specific binaries (need to rebuild for each platform)
- ❌ Crash in addon crashes entire Node.js process

### Recommendations
1. **Use Option 2 for**:
   - High-throughput production systems
   - Sub-second latency requirements
   - Processing 100+ stickers per request

2. **Stick with Option 1 for**:
   - Simpler deployment
   - Easier debugging
   - Good enough performance (5-10× faster)

## Migration Path

1. **Keep Option 1 as fallback**:
   ```typescript
   if (napiPacker.isAvailable()) {
     return napiPacker.packAsync(stickers, config);
   } else if (cppPacker.isAvailable()) {
     return cppPacker.packStickers(stickers, config);
   } else {
     return jsPacker.nestStickers(stickers, config);
   }
   ```

2. **A/B test Option 2**:
   - Deploy to subset of traffic
   - Monitor for crashes/errors
   - Compare performance metrics

3. **Gradual rollout**:
   - Week 1: 10% traffic
   - Week 2: 50% traffic
   - Week 3: 100% traffic (if stable)

## Additional Resources

- [Node.js N-API Documentation](https://nodejs.org/api/n-api.html)
- [node-addon-api](https://github.com/nodejs/node-addon-api)
- [libnest2d GitHub](https://github.com/tamasmeszaros/libnest2d)
- [N-API Best Practices](https://nodejs.org/en/docs/guides/addons/)

## Estimated Implementation Time

- **Setup & configuration**: 2-3 hours
- **Core implementation**: 1-2 days
- **Testing & debugging**: 1-2 days
- **Docker integration**: 0.5-1 day
- **Production hardening**: 1-2 days

**Total**: 5-8 days for production-ready implementation

## Conclusion

Option 2 (N-API addon) provides maximum performance but requires significant development and maintenance effort. **Only implement if Option 1 doesn't meet your performance requirements**.

For most use cases, **Option 1 (CLI wrapper) is the sweet spot** - easy to maintain, good performance, simple deployment.
