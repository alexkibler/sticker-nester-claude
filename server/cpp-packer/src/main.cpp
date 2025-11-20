/**
 * nest-packer: High-performance polygon nesting CLI using libnest2d
 *
 * Input: JSON via stdin with stickers and configuration
 * Output: JSON via stdout with placement results
 *
 * Example input:
 * {
 *   "stickers": [
 *     {
 *       "id": "sticker1",
 *       "points": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}, {"x": 0, "y": 1}],
 *       "width": 1.0,
 *       "height": 1.0
 *     }
 *   ],
 *   "sheetWidth": 12.0,
 *   "sheetHeight": 12.0,
 *   "spacing": 0.0625,
 *   "allowRotation": true
 * }
 */

#include <iostream>
#include <vector>
#include <string>
#include <chrono>
#include <algorithm>
#include <nlohmann/json.hpp>

// Libnest2d includes (header-only library)
#include <libnest2d/libnest2d.hpp>

using json = nlohmann::json;
using namespace libnest2d;

// Type definitions for convenience
using Point = PointImpl;
using Polygon = PolygonImpl;
using Item = _Item<Polygon>;
using Coord = TCoord<Point>;

/**
 * Convert JSON point to libnest2d Point
 */
Point jsonToPoint(const json& jp) {
    return Point(
        static_cast<Coord>(jp["x"].get<double>() * 1000000.0), // Convert inches to nanometers
        static_cast<Coord>(jp["y"].get<double>() * 1000000.0)
    );
}

/**
 * Convert libnest2d Point to JSON point
 */
json pointToJson(const Point& p) {
    return {
        {"x", static_cast<double>(getX(p)) / 1000000.0}, // Convert nanometers back to inches
        {"y", static_cast<double>(getY(p)) / 1000000.0}
    };
}

/**
 * Convert JSON polygon to libnest2d Polygon
 */
Polygon jsonToPolygon(const json& points) {
    Polygon poly;
    for (const auto& jp : points) {
        poly.addPoint(jsonToPoint(jp));
    }
    return poly;
}

/**
 * Main packing function
 */
json packPolygons(const json& input) {
    auto startTime = std::chrono::high_resolution_clock::now();

    try {
        // Parse input
        const auto& stickersJson = input["stickers"];
        double sheetWidth = input["sheetWidth"].get<double>();
        double sheetHeight = input["sheetHeight"].get<double>();
        double spacing = input.value("spacing", 0.0625);
        bool allowRotation = input.value("allowRotation", true);

        std::cerr << "[C++ Packer] Processing " << stickersJson.size() << " stickers" << std::endl;
        std::cerr << "[C++ Packer] Sheet: " << sheetWidth << "\" × " << sheetHeight << "\"" << std::endl;
        std::cerr << "[C++ Packer] Spacing: " << spacing << "\"" << std::endl;
        std::cerr << "[C++ Packer] Rotation: " << (allowRotation ? "enabled" : "disabled") << std::endl;

        // Convert dimensions to nanometers (libnest2d's internal unit)
        Coord width = static_cast<Coord>(sheetWidth * 1000000.0);
        Coord height = static_cast<Coord>(sheetHeight * 1000000.0);
        Coord spacingCoord = static_cast<Coord>(spacing * 1000000.0);

        // Create items from stickers
        std::vector<Item> items;
        items.reserve(stickersJson.size());

        for (size_t i = 0; i < stickersJson.size(); ++i) {
            const auto& sticker = stickersJson[i];

            // Convert points to polygon
            Polygon poly = jsonToPolygon(sticker["points"]);

            // Create item
            Item item(poly);
            item.binId(i); // Use index as temporary ID

            // Enable rotation if requested
            if (allowRotation) {
                item.markAsFixedRotation(false);
            }

            items.push_back(std::move(item));
        }

        // Sort items by area (largest first) for better packing
        std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) {
            return a.area() > b.area();
        });

        std::cerr << "[C++ Packer] Items sorted by area" << std::endl;

        // Configure packer
        using Placer = placers::_NofitPolyPlacer<Polygon>;
        using Selector = selections::_FirstFitSelection;

        // Create bin configuration
        auto bin = Box(width, height);

        // Pack items
        std::cerr << "[C++ Packer] Starting packing algorithm..." << std::endl;
        auto packStart = std::chrono::high_resolution_clock::now();

        // Configure placer with rotation and spacing
        Placer::Config placerConfig;
        placerConfig.rotations = allowRotation ?
            std::vector<Radians>{0.0, PI/2.0, PI, 3*PI/2.0} :
            std::vector<Radians>{0.0};
        placerConfig.accuracy = 1.0; // Higher accuracy
        placerConfig.alignment = Placer::Config::Alignment::CENTER;

        // Run nesting algorithm
        size_t binCount = nest(items, bin, spacingCoord,
                              NestConfig<Placer, Selector>()
                                  .placer_config(placerConfig));

        auto packEnd = std::chrono::high_resolution_clock::now();
        auto packDuration = std::chrono::duration_cast<std::chrono::milliseconds>(packEnd - packStart).count();

        std::cerr << "[C++ Packer] Packing complete in " << packDuration << "ms" << std::endl;
        std::cerr << "[C++ Packer] Created " << binCount << " bin(s)" << std::endl;

        // Build result JSON
        json result;
        result["success"] = true;
        result["binCount"] = binCount;
        result["placements"] = json::array();
        result["timing"] = {
            {"packingMs", packDuration}
        };

        // Extract placements
        size_t placedCount = 0;
        for (size_t i = 0; i < items.size(); ++i) {
            const auto& item = items[i];

            if (item.binId() != BIN_ID_UNSET) {
                // Item was placed
                const auto& transformedShape = item.transformedShape();
                auto bbox = transformedShape.boundingBox();

                // Get original sticker ID
                size_t originalIndex = i;
                std::string stickerId = stickersJson[originalIndex]["id"].get<std::string>();

                // Get position (bottom-left of bounding box)
                Point minCorner = bbox.minCorner();

                // Get rotation angle
                double rotation = item.rotation();
                int rotationDegrees = static_cast<int>(std::round(rotation * 180.0 / PI));

                // Normalize rotation to [0, 360)
                rotationDegrees = rotationDegrees % 360;
                if (rotationDegrees < 0) rotationDegrees += 360;

                json placement = {
                    {"id", stickerId},
                    {"x", static_cast<double>(getX(minCorner)) / 1000000.0},
                    {"y", static_cast<double>(getY(minCorner)) / 1000000.0},
                    {"rotation", rotationDegrees},
                    {"binId", item.binId()}
                };

                result["placements"].push_back(placement);
                placedCount++;
            }
        }

        result["placedCount"] = placedCount;
        result["totalCount"] = items.size();

        std::cerr << "[C++ Packer] Placed " << placedCount << "/" << items.size() << " items" << std::endl;

        // Calculate utilization
        if (binCount > 0) {
            double totalArea = 0.0;
            for (const auto& item : items) {
                if (item.binId() != BIN_ID_UNSET) {
                    totalArea += static_cast<double>(item.area()) / 1000000000000.0; // Convert from nm² to in²
                }
            }
            double sheetArea = sheetWidth * sheetHeight;
            double utilization = (totalArea / sheetArea) * 100.0;
            result["utilization"] = utilization;

            std::cerr << "[C++ Packer] Utilization: " << utilization << "%" << std::endl;
        }

        auto endTime = std::chrono::high_resolution_clock::now();
        auto totalDuration = std::chrono::duration_cast<std::chrono::milliseconds>(endTime - startTime).count();
        result["timing"]["totalMs"] = totalDuration;

        std::cerr << "[C++ Packer] Total time: " << totalDuration << "ms" << std::endl;

        return result;

    } catch (const std::exception& e) {
        std::cerr << "[C++ Packer] ERROR: " << e.what() << std::endl;
        return {
            {"success", false},
            {"error", e.what()}
        };
    }
}

int main(int argc, char* argv[]) {
    try {
        // Read JSON from stdin
        json input;
        std::cin >> input;

        // Process packing
        json output = packPolygons(input);

        // Write JSON to stdout
        std::cout << output.dump() << std::endl;

        return output["success"].get<bool>() ? 0 : 1;

    } catch (const std::exception& e) {
        std::cerr << "[C++ Packer] FATAL ERROR: " << e.what() << std::endl;

        json error = {
            {"success", false},
            {"error", std::string("Fatal error: ") + e.what()}
        };
        std::cout << error.dump() << std::endl;

        return 1;
    }
}
