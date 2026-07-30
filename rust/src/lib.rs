mod calculator;
mod data;
mod encoding;
mod entity;
mod vec3;

use calculator::{calculate, simulate, get_pearl_blocker};
use vec3::Vec3;
use wasm_bindgen::prelude::*;

// ─── Calculate TNT ────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn wasm_calculate(
    pearl_x: f64,
    pearl_z: f64,
    dest_x: f64,
    dest_z: f64,
    max_tnt: i32,
    max_ticks: i32,
    max_distance: f64,
    cannon_max_tnt: i32,
    version: &str,
) -> JsValue {
    let v = match version {
        "26_2" => data::Version::V26_2,
        _ => data::Version::V1_21_2,
    };
    data::set_version(v);
    let pearl_pos = Vec3::new(pearl_x, data::PEARL_Y, pearl_z);
    let dest_pos = Vec3::new(dest_x, 256.0, dest_z);
    let results = calculate(pearl_pos, dest_pos, max_tnt, max_ticks, max_distance, cannon_max_tnt);
    serde_wasm_bindgen::to_value(&results).unwrap_or(JsValue::NULL)
}

// ─── Simulate Pearl ───────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn wasm_simulate(
    pos_x: f64,
    pos_y: f64,
    pos_z: f64,
    mot_x: f64,
    mot_y: f64,
    mot_z: f64,
) -> JsValue {
    let pos = Vec3::new(pos_x, pos_y, pos_z);
    let motion = Vec3::new(mot_x, mot_y, mot_z);
    let ticks = simulate(pos, motion);
    serde_wasm_bindgen::to_value(&ticks).unwrap_or(JsValue::NULL)
}

// ─── Get Pearl Blocker ────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn wasm_get_pearl_blocker(
    pos_x: f64,
    pos_y: f64,
    pos_z: f64,
    mot_x: f64,
    mot_y: f64,
    mot_z: f64,
) -> String {
    use entity::Pearl;
    let pearl = Pearl::new(Vec3::new(pos_x, pos_y, pos_z), Vec3::new(mot_x, mot_y, mot_z));
    get_pearl_blocker(pearl).as_int()
}
