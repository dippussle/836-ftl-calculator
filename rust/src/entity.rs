use crate::data;
use crate::vec3::Vec3;

#[derive(Clone, Copy)]
pub struct Pearl {
    pub pos: Vec3,
    pub motion: Vec3,
}

impl Pearl {
    pub fn new(pos: Vec3, motion: Vec3) -> Self {
        Pearl { pos, motion }
    }

    pub fn tick(&mut self) {
        self.motion = self.motion.add(Vec3::new(0.0, -0.03, 0.0));
        self.motion = self.motion.multiply(data::PEARL_DRAG);
        self.pos = self.pos.add(self.motion);
    }
}

#[derive(Clone, Copy)]
pub struct Tnt {
    pub pos: Vec3,
    pub motion: Vec3,
}

impl Tnt {
    pub fn new(pos: Vec3, motion: Vec3) -> Self {
        Tnt { pos, motion }
    }

    pub fn tick(&mut self) {
        self.motion = self.motion.add(Vec3::new(0.0, -0.04, 0.0));
        self.pos = self.pos.add(self.motion);
        let drag = if data::get_version() == data::Version::V1_21_2 { 0.98 } else { 0.98_f32 as f64 };
        self.motion = self.motion.multiply(drag);
    }

    pub fn calc_velocity_from_explosion(
        self,
        entity_pos: Vec3,
        eye_height: f64,
        exposure: f64,
        is_tnt: bool,
    ) -> Vec3 {
        let explosion_pos = self.pos.add(Vec3::new(0.0, data::EXPLOSION_HEIGHT, 0.0));
        let dist_norm = explosion_pos.distance_to(entity_pos) / 8.0;
        if dist_norm > 1.0 {
            return Vec3::zero();
        }
        let entity_y = if is_tnt { entity_pos.y } else { entity_pos.y + eye_height };
        let dir = Vec3::new(
            entity_pos.x - explosion_pos.x,
            entity_y - explosion_pos.y,
            entity_pos.z - explosion_pos.z,
        );
        let len = dir.length();
        if len == 0.0 {
            return Vec3::zero();
        }
        dir.multiply(1.0 / len).multiply((1.0 - dist_norm) * exposure)
    }
}
