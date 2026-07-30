#[derive(Clone, Copy, Debug, Default)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Vec3 { x, y, z }
    }

    pub fn zero() -> Self {
        Vec3 { x: 0.0, y: 0.0, z: 0.0 }
    }

    pub fn add(self, other: Vec3) -> Vec3 {
        Vec3::new(self.x + other.x, self.y + other.y, self.z + other.z)
    }

    pub fn multiply(self, n: f64) -> Vec3 {
        Vec3::new(self.x * n, self.y * n, self.z * n)
    }

    pub fn distance_to(self, other: Vec3) -> f64 {
        let dx = other.x - self.x;
        let dy = other.y - self.y;
        let dz = other.z - self.z;
        (dx * dx + dy * dy + dz * dz).sqrt()
    }

    pub fn length(self) -> f64 {
        (self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }

    pub fn length_horizontal(self) -> f64 {
        (self.x * self.x + self.z * self.z).sqrt()
    }

    pub fn pretty(self) -> String {
        format!("({:.3}, {:.3}, {:.3})", self.x, self.y, self.z)
    }

    pub fn as_int(self) -> String {
        format!("{} {} {}", self.x as i64, self.y as i64, self.z as i64)
    }
}
