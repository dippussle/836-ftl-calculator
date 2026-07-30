use crate::data;
use crate::entity::{Pearl, Tnt};
use crate::encoding;
use crate::vec3::Vec3;
use serde::Serialize;

// ─── Direction ───────────────────────────────────────────────────────────────

pub struct Direction {
    pub direction: i32,
    pub angle: i32,
}

impl Direction {
    pub const WEST_NORTH_WEST: i32 = 0;
    pub const EAST_NORTH_EAST: i32 = 1;
    pub const NORTH_NORTH_WEST: i32 = 2;
    pub const NORTH_NORTH_EAST: i32 = 3;
    pub const SOUTH_SOUTH_EAST: i32 = 4;
    pub const SOUTH_SOUTH_WEST: i32 = 5;
    pub const EAST_SOUTH_EAST: i32 = 6;
    pub const WEST_SOUTH_WEST: i32 = 7;

    pub fn calculate(vec: Vec3) -> Self {
        let cos45 = (45.0_f64).to_radians().cos();
        let sin45 = (45.0_f64).to_radians().sin();
        let rotated_x = vec.x * cos45 - vec.z * sin45;
        let rotated_z = vec.x * sin45 + vec.z * cos45;
        let scale = data::NUM_OF_ANGLES as f64 / rotated_x.abs().max(rotated_z.abs());
        let angle = ((rotated_x * scale).abs().min((rotated_z * scale).abs())).floor() as i32;

        let mut vec_angle = vec.z.atan2(vec.x).to_degrees();
        if vec_angle < 0.0 {
            vec_angle += 360.0;
        }

        let direction = if vec_angle < 45.0 {
            Self::EAST_SOUTH_EAST
        } else if vec_angle < 90.0 {
            Self::SOUTH_SOUTH_EAST
        } else if vec_angle < 135.0 {
            Self::SOUTH_SOUTH_WEST
        } else if vec_angle < 180.0 {
            Self::WEST_SOUTH_WEST
        } else if vec_angle < 225.0 {
            Self::WEST_NORTH_WEST
        } else if vec_angle < 270.0 {
            Self::NORTH_NORTH_WEST
        } else if vec_angle < 315.0 {
            Self::NORTH_NORTH_EAST
        } else {
            Self::EAST_NORTH_EAST
        };

        Direction { direction, angle }
    }
}

// ─── PearlSimulation ─────────────────────────────────────────────────────────

pub struct PearlSimulation {
    pub pos: Vec3,
    pub motion: Vec3, // final motion after upaccel applied
    pub ticks: i32,
    pub upaccel_tnt: i32,
    pub long_range: bool,
}

impl PearlSimulation {
    pub fn new(
        pos: Vec3,
        initial_motion: Vec3,
        ticks: i32,
        upaccel_tnt: i32,
        long_range: bool,
    ) -> Self {
        let long_range = long_range && upaccel_tnt > 0;

        let tnt_y = if long_range {
            compute_upaccel_tnt_y(data::UPACCEL_TNT_LONGRANGE_START_Y)
        } else {
            compute_upaccel_tnt_y(data::UPACCEL_TNT_START_Y)
        };

        let tnt = Tnt::new(
            Vec3::new(
                pos.x - data::PEARL_HORIZONTAL_OFFSET,
                tnt_y,
                pos.z - data::PEARL_HORIZONTAL_OFFSET,
            ),
            Vec3::zero(),
        );

        let upaccel_vel = tnt
            .calc_velocity_from_explosion(pos, data::PEARL_EYE_HEIGHT, 1.0, false)
            .multiply(upaccel_tnt as f64);

        let motion = initial_motion.add(upaccel_vel);

        PearlSimulation { pos, motion, ticks, upaccel_tnt, long_range }
    }

    pub fn get_end(&self) -> Pearl {
        let mut pearl = Pearl::new(self.pos, self.motion);
        for _ in 0..self.ticks {
            pearl.tick();
        }
        pearl
    }
}

// ─── TNT vectors ─────────────────────────────────────────────────────────────

// Returns (early_tnt_vector, late_tnt_vector)
fn calculate_tnt_vectors(dist: Vec3, dir: &Direction) -> (Vec3, Vec3) {
    // Determine alignment TNT positions based on destination direction
    let mut first_pos = Vec3::new(
        if dist.x < 0.0 { -1.0 } else { 1.0 },
        0.0,
        if dist.z < 0.0 { -1.0 } else { 1.0 },
    );
    let mut second_pos = first_pos;
    if dist.x.abs() > dist.z.abs() {
        second_pos.z *= -1.0;
    } else {
        second_pos.x *= -1.0;
    }

    first_pos = first_pos
        .multiply(data::ALIGNMENT_TNT_OFFSET)
        .add(Vec3::new(0.0, data::ALIGNMENT_TNT_Y, 0.0));
    second_pos = second_pos
        .multiply(data::ALIGNMENT_TNT_OFFSET)
        .add(Vec3::new(0.0, data::ALIGNMENT_TNT_Y, 0.0));

    let first_tnt = Tnt::new(first_pos, Vec3::zero());
    let second_tnt = Tnt::new(second_pos, Vec3::zero());
    let basket_upaccel_tnt = Tnt::new(Vec3::new(0.0, data::BASKET_UPACCEL_TNT_Y, 0.0), Vec3::zero());

    // Both early and late TNT start at same basket position/motion
    let mut early_tnt =
        Tnt::new(Vec3::new(0.0, data::BASKET_TNT_Y, 0.0), Vec3::new(0.0, data::BASKET_TNT_Y_MOTION, 0.0));
    let mut late_tnt =
        Tnt::new(Vec3::new(0.0, data::BASKET_TNT_Y, 0.0), Vec3::new(0.0, data::BASKET_TNT_Y_MOTION, 0.0));

    // f32 cast to match game engine's single-precision float behavior
    let align_exposure = (1.0_f32 / 27.0_f32) as f64;
    let num_angles = data::NUM_OF_ANGLES as f64;

    // Early TNT: angle multiplier = direction.angle
    early_tnt.motion = early_tnt
        .motion
        .add(
            first_tnt
                .calc_velocity_from_explosion(early_tnt.pos, 0.0, align_exposure, true)
                .multiply(num_angles),
        )
        .add(
            second_tnt
                .calc_velocity_from_explosion(early_tnt.pos, 0.0, align_exposure, true)
                .multiply(dir.angle as f64),
        )
        .add(
            basket_upaccel_tnt
                .calc_velocity_from_explosion(early_tnt.pos, 0.0, 1.0, true)
                .multiply(data::BASKET_UPACCEL_TNT as f64),
        );

    // Late TNT: angle multiplier = direction.angle + 1
    // NOTE: basket upaccel uses early_tnt.pos, not late_tnt.pos
    let early_pos_for_basket = early_tnt.pos;
    late_tnt.motion = late_tnt
        .motion
        .add(
            first_tnt
                .calc_velocity_from_explosion(late_tnt.pos, 0.0, align_exposure, true)
                .multiply(num_angles),
        )
        .add(
            second_tnt
                .calc_velocity_from_explosion(late_tnt.pos, 0.0, align_exposure, true)
                .multiply(dir.angle as f64 + 1.0),
        )
        .add(
            basket_upaccel_tnt
                .calc_velocity_from_explosion(early_pos_for_basket, 0.0, 1.0, true)
                .multiply(data::BASKET_UPACCEL_TNT as f64),
        );

    early_tnt.tick();
    late_tnt.tick();

    // Pearl reference position for final velocity calculation
    let pearl_pos = Vec3::new(
        data::PEARL_HORIZONTAL_OFFSET,
        data::PEARL_Y,
        data::PEARL_HORIZONTAL_OFFSET,
    );

    let early_vec =
        early_tnt.calc_velocity_from_explosion(pearl_pos, data::PEARL_EYE_HEIGHT, 1.0, false);
    let late_vec =
        late_tnt.calc_velocity_from_explosion(pearl_pos, data::PEARL_EYE_HEIGHT, 1.0, false);

    (early_vec, late_vec)
}

// ─── compute upaccel TNT explosion y ─────────────────────────────────────────

fn compute_upaccel_tnt_y(start_y: f64) -> f64 {
    let mut tnt = Tnt::new(Vec3::new(0.0, start_y, 0.0), Vec3::zero());
    for _ in 0..15 {
        tnt.tick();
    }
    let basket_tnt = Tnt::new(Vec3::new(0.0, data::BASKET_UPACCEL_TNT_Y, 0.0), Vec3::zero());
    let vel = basket_tnt
        .calc_velocity_from_explosion(tnt.pos, 0.0, 1.0, true)
        .multiply(data::BASKET_UPACCEL_TNT as f64);
    tnt.motion = tnt.motion.add(vel);
    tnt.tick();
    tnt.pos.y
}

// ─── calculatePossibleTicks ──────────────────────────────────────────────────

fn calculate_possible_ticks(upaccel_tnt_y: f64) -> Vec<i32> {
    let pearl_pos = Vec3::new(
        data::PEARL_HORIZONTAL_OFFSET,
        data::PEARL_Y,
        data::PEARL_HORIZONTAL_OFFSET,
    );
    let pearl_motion = Vec3::new(0.0, data::PEARL_Y_MOTION, 0.0);

    // motion per single upaccel TNT
    let tnt = Tnt::new(Vec3::new(0.0, upaccel_tnt_y, 0.0), Vec3::zero());
    let motion_per_tnt =
        tnt.calc_velocity_from_explosion(pearl_pos, data::PEARL_EYE_HEIGHT, 1.0, false);

    let mut result = Vec::with_capacity((data::MAX_UPACCEL_TNT + 1) as usize);
    for n in 0..=(data::MAX_UPACCEL_TNT) {
        let mut p = Pearl::new(pearl_pos, pearl_motion.add(motion_per_tnt.multiply(n as f64)));
        let mut ticks = 0i32;
        while p.pos.y > data::PEARL_STOP_HEIGHT {
            p.tick();
            ticks += 1;
        }
        result.push(ticks - 1);
    }
    result
}

// ─── getPearlBlocker ─────────────────────────────────────────────────────────

pub fn get_pearl_blocker(pearl: Pearl) -> Vec3 {
    let pos = pearl.pos;
    let motion = pearl.motion.add(Vec3::new(0.0, -0.03, 0.0)).multiply(data::PEARL_DRAG);

    if motion.y >= 0.0 || pos.y < data::PEARL_STOP_HEIGHT {
        return Vec3::zero();
    }

    let t = (data::PEARL_STOP_HEIGHT - pos.y) / motion.y;
    if t < 0.0 || t > 1.0 {
        return Vec3::zero();
    }

    let x = pos.x + t * motion.x;
    let z = pos.z + t * motion.z;
    Vec3::new(x.floor(), data::PEARL_STOP_HEIGHT - 1.0, z.floor())
}

// ─── Result types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct CalculationResult {
    pub early_tnt: i32,
    pub late_tnt: i32,
    pub distance: f64,
    pub ticks: i32,
    pub end_pos: [f64; 3],
    pub sim_pos: [f64; 3],
    pub sim_motion: [f64; 3],
    pub upaccel_tnt: i32,
    pub long_range: bool,
    pub direction: i32,
    pub direction_angle: i32,
    pub encoding: String,
}

#[derive(Serialize)]
pub struct SimTick {
    pub tick: i32,
    pub pos: [f64; 3],
    pub motion: [f64; 3],
}

// ─── calculate ───────────────────────────────────────────────────────────────

pub fn calculate(
    pearl_pos: Vec3,
    dest_pos: Vec3,
    max_tnt: i32,
    max_ticks: i32,
    max_distance: f64,
    cannon_max_tnt: i32,
) -> Vec<CalculationResult> {
    let mut results: Vec<CalculationResult> = Vec::new();

    // possibleTicks = calculatePossibleTicks(LONGRANGE) + calculatePossibleTicks(NORMAL)
    let mut possible_ticks = calculate_possible_ticks(compute_upaccel_tnt_y(data::UPACCEL_TNT_LONGRANGE_START_Y));
    possible_ticks.extend(calculate_possible_ticks(compute_upaccel_tnt_y(data::UPACCEL_TNT_START_Y)));

    let mut divider = 0.0_f64;
    let distance_exact = dest_pos.add(pearl_pos.multiply(-1.0));
    let dir = Direction::calculate(distance_exact);
    let (early_vec, late_vec) = calculate_tnt_vectors(distance_exact, &dir);

    // Solve 2x2 system for exact TNT amounts
    let denom = early_vec.z * late_vec.x - late_vec.z * early_vec.x;
    let early_tnt_exact =
        (distance_exact.z * late_vec.x - distance_exact.x * late_vec.z) / denom;
    let late_tnt_exact = (distance_exact.x - early_tnt_exact * early_vec.x) / late_vec.x;

    let mut upaccel_tnt = 0i32;
    let mut long_range = false;
    let mut try_again = false;

    for tick in 1..=max_ticks {
        divider += data::PEARL_DRAG.powi(tick);

        match possible_ticks.iter().position(|&t| t == tick) {
            Some(idx) => {
                upaccel_tnt = (idx as i32) % (data::MAX_UPACCEL_TNT + 1);
                long_range = (idx as i32) <= (data::MAX_UPACCEL_TNT + 1);
            }
            None => {
                if !try_again {
                    continue;
                }
            }
        }
        try_again = false;

        let early_tnt = (early_tnt_exact / divider).round() as i32;
        let late_tnt = (late_tnt_exact / divider).round() as i32;

        for a in -2i32..=2 {
            for b in -2i32..=2 {
                let ea = early_tnt + a;
                let lb = late_tnt + b;

                if ea < 0 || lb < 0 {
                    continue;
                }

                let total_tnt = ea + lb;
                if max_tnt >= 0 && total_tnt > max_tnt {
                    continue;
                }

                let max_variable_tnt = cannon_max_tnt - 22;
                if ea / 11 + lb / 11 > max_variable_tnt / 11 {
                    continue;
                }

                let init_motion = Vec3::new(0.0, data::PEARL_Y_MOTION, 0.0)
                    .add(early_vec.multiply(ea as f64))
                    .add(late_vec.multiply(lb as f64));

                let sim = PearlSimulation::new(pearl_pos, init_motion, tick, upaccel_tnt, long_range);
                let end = sim.get_end();

                let distance = end.pos.add(dest_pos.multiply(-1.0)).length_horizontal();
                if distance > max_distance {
                    continue;
                }

                if end.pos.y < data::PEARL_STOP_HEIGHT {
                    try_again = true;
                    continue;
                }

                let mut end2 = end;
                end2.tick();
                if end2.pos.y >= data::PEARL_STOP_HEIGHT {
                    try_again = true;
                    continue;
                }

                let blocker = get_pearl_blocker(end);
                let enc = encoding::compute_encoding(
                    ea,
                    lb,
                    sim.upaccel_tnt,
                    sim.long_range,
                    dir.direction,
                    dir.angle,
                    &blocker.as_int(),
                    cannon_max_tnt,
                );

                results.push(CalculationResult {
                    early_tnt: ea,
                    late_tnt: lb,
                    distance,
                    ticks: tick,
                    end_pos: [end.pos.x, end.pos.y, end.pos.z],
                    sim_pos: [sim.pos.x, sim.pos.y, sim.pos.z],
                    sim_motion: [sim.motion.x, sim.motion.y, sim.motion.z],
                    upaccel_tnt: sim.upaccel_tnt,
                    long_range: sim.long_range,
                    direction: dir.direction,
                    direction_angle: dir.angle,
                    encoding: enc,
                });
            }
        }
    }

    results.sort_by(|a, b| a.distance.partial_cmp(&b.distance).unwrap());
    results
}

// ─── simulate ────────────────────────────────────────────────────────────────

pub fn simulate(pos: Vec3, motion: Vec3) -> Vec<SimTick> {
    let mut ticks = Vec::new();
    let mut pearl = Pearl::new(pos, motion);
    let mut tick = 0i32;

    while pearl.pos.y > data::PEARL_STOP_HEIGHT {
        ticks.push(SimTick {
            tick,
            pos: [pearl.pos.x, pearl.pos.y, pearl.pos.z],
            motion: [pearl.motion.x, pearl.motion.y, pearl.motion.z],
        });
        pearl.tick();
        tick += 1;
    }

    ticks
}
