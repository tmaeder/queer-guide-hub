use std::f64::consts::PI;
use wasm_bindgen::prelude::*;

const R: f64 = 6371.0; // Earth radius in km

/// Haversine distance in km between two lat/lng points.
#[wasm_bindgen]
pub fn haversine_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let d_lat = (lat2 - lat1) * PI / 180.0;
    let d_lon = (lon2 - lon1) * PI / 180.0;
    let a = (d_lat / 2.0).sin().powi(2)
        + (lat1 * PI / 180.0).cos() * (lat2 * PI / 180.0).cos() * (d_lon / 2.0).sin().powi(2);
    R * 2.0 * a.sqrt().atan2((1.0 - a).sqrt())
}

/// Find the nearest N points from an origin. Returns a JSON array of [index, distance] pairs.
///
/// `points_json` is a JSON array of [lat, lon] pairs.
/// Returns JSON array of [index, distance_km] sorted by distance, limited to `limit`.
#[wasm_bindgen]
pub fn batch_nearest(
    origin_lat: f64,
    origin_lon: f64,
    points_json: &str,
    limit: usize,
) -> String {
    let points: Vec<[f64; 2]> = match serde_json::from_str(points_json) {
        Ok(p) => p,
        Err(_) => return "[]".to_string(),
    };

    let mut distances: Vec<(usize, f64)> = points
        .iter()
        .enumerate()
        .map(|(i, p)| (i, haversine_km(origin_lat, origin_lon, p[0], p[1])))
        .collect();

    distances.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    distances.truncate(limit);

    serde_json::to_string(&distances).unwrap_or_else(|_| "[]".to_string())
}

/// Check if a point is inside a polygon (ray casting algorithm).
/// `polygon_json` is a JSON array of [lat, lon] pairs forming the polygon boundary.
#[wasm_bindgen]
pub fn point_in_polygon(lat: f64, lon: f64, polygon_json: &str) -> bool {
    let polygon: Vec<[f64; 2]> = match serde_json::from_str(polygon_json) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let n = polygon.len();
    if n < 3 {
        return false;
    }

    let mut inside = false;
    let mut j = n - 1;

    for i in 0..n {
        let yi = polygon[i][0];
        let xi = polygon[i][1];
        let yj = polygon[j][0];
        let xj = polygon[j][1];

        if ((yi > lat) != (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }

    inside
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn haversine_known_distance() {
        // Paris (48.8566, 2.3522) to London (51.5074, -0.1278) ≈ 344 km
        let d = haversine_km(48.8566, 2.3522, 51.5074, -0.1278);
        assert!((d - 344.0).abs() < 2.0, "Expected ~344km, got {d}");
    }

    #[test]
    fn haversine_same_point() {
        let d = haversine_km(40.0, -74.0, 40.0, -74.0);
        assert!(d.abs() < 0.001);
    }

    #[test]
    fn batch_nearest_basic() {
        let points = "[[51.5074,-0.1278],[40.7128,-74.006],[35.6762,139.6503]]";
        let result = batch_nearest(48.8566, 2.3522, points, 2);
        let parsed: Vec<(usize, f64)> = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].0, 0); // London is closest to Paris
    }

    #[test]
    fn point_in_polygon_inside() {
        // Simple square polygon around (0,0)
        let polygon = "[[-1,-1],[-1,1],[1,1],[1,-1]]";
        assert!(point_in_polygon(0.0, 0.0, polygon));
    }

    #[test]
    fn point_in_polygon_outside() {
        let polygon = "[[-1,-1],[-1,1],[1,1],[1,-1]]";
        assert!(!point_in_polygon(2.0, 2.0, polygon));
    }
}
