export type PetPose = {
  id: string;
  x: number;
  width: number;
  facing: 1 | -1;
  mode: "idle" | "walk" | "run" | "swipe" | "with_ball";
  nextAction: number;
};

export type PetBall = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  held: boolean;
  age: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Pixels and seconds throughout: a pet's travel is measured against the ledge. */
export class PetPlayground {
  pets: PetPose[] = [];
  ball: PetBall | null = null;
  width = 0;
  scale = 1;
  time = 0;

  constructor(private readonly random: () => number = Math.random) {}

  resize(width: number, scale: number): void {
    const oldWidth = this.width;
    this.width = Math.max(0, width);
    this.scale = scale;
    for (const pet of this.pets) {
      if (oldWidth > 0) pet.x *= this.width / oldWidth;
      pet.x = clamp(pet.x, 0, Math.max(0, this.width - pet.width));
    }
    if (this.ball) this.ball.x = this.boundBallX(this.ball.x);
  }

  /** Keep existing poses when the roster changes; randomize only newly spawned pets. */
  syncPets(entries: { id: string; width: number }[]): void {
    this.pets = entries.map(({ id, width }) => {
      const existing = this.pets.find((pet) => pet.id === id);
      if (existing) {
        existing.width = width;
        existing.x = clamp(existing.x, 0, Math.max(0, this.width - width));
        return existing;
      }
      return {
        id,
        width,
        x: this.random() * Math.max(0, this.width - width),
        facing: this.random() < 0.5 ? -1 : 1,
        mode: "walk",
        nextAction: this.time + 1.5 + this.random() * 3,
      };
    });
  }

  private boundBallX(x: number): number {
    const radius = Math.min(4 * this.scale, this.width / 2);
    return clamp(x, radius, Math.max(radius, this.width - radius));
  }

  holdBall(x: number, y: number): void {
    this.ball = {
      x: this.boundBallX(x),
      y: Math.max(4 * this.scale, y),
      vx: 0,
      vy: 0,
      held: true,
      age: 0,
    };
  }

  releaseBall(dx: number, dy: number, seconds: number): void {
    if (!this.ball) return;
    const click = Math.hypot(dx, dy) < 5;
    const duration = Math.max(0.06, seconds);
    this.ball.vx = click
      ? (this.random() < 0.5 ? -1 : 1) *
        (160 + this.random() * 120) *
        this.scale
      : clamp(dx / duration, -1100 * this.scale, 1100 * this.scale);
    this.ball.vy = click
      ? (220 + this.random() * 110) * this.scale
      : clamp(dy / duration, -900 * this.scale, 900 * this.scale);
    this.ball.held = false;
  }

  throwRandomBall(): void {
    this.holdBall(
      this.random() * this.width,
      (25 + this.random() * 35) * this.scale,
    );
    this.releaseBall(0, 0, 0);
  }

  step(seconds: number): void {
    const dt = clamp(seconds, 0, 0.05);
    this.time += dt;
    const ball = this.ball;
    const radius = 4 * this.scale;
    if (ball && !ball.held) {
      ball.age += dt;
      ball.vy -= 700 * this.scale * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      const boundedX = this.boundBallX(ball.x);
      if (boundedX !== ball.x) {
        ball.x = boundedX;
        ball.vx *= -0.72;
      }
      if (ball.y <= radius) {
        ball.y = radius;
        ball.vy =
          Math.abs(ball.vy) > 45 * this.scale ? Math.abs(ball.vy) * 0.62 : 0;
        ball.vx *= Math.exp(-3.5 * dt);
      }
      if (ball.age > 15) this.ball = null;
    }

    for (const pet of this.pets) {
      if (pet.mode === "with_ball" && this.time < pet.nextAction) continue;
      const target = this.ball;
      let speed = 0;
      if (target && !target.held) {
        const distance = target.x - (pet.x + pet.width / 2);
        if (Math.abs(distance) > 2) pet.facing = distance < 0 ? -1 : 1;
        pet.mode = "run";
        speed = Math.min(
          110 * this.scale,
          Math.abs(distance) / Math.max(dt, 0.001),
        );
        if (
          target.y <= radius + 6 * this.scale &&
          Math.abs(distance) < pet.width / 2 + radius
        ) {
          this.ball = null;
          pet.mode = "with_ball";
          pet.nextAction = this.time + 1.8;
          speed = 0;
        }
      } else {
        if (this.time >= pet.nextAction) {
          const choice = this.random();
          pet.mode =
            choice < 0.25
              ? "idle"
              : choice < 0.35
                ? "swipe"
                : choice < 0.8
                  ? "walk"
                  : "run";
          pet.nextAction = this.time + 1.5 + this.random() * 3;
        }
        speed =
          pet.mode === "walk"
            ? 32 * this.scale
            : pet.mode === "run"
              ? 65 * this.scale
              : 0;
      }
      const edge = Math.max(0, this.width - pet.width);
      pet.x += pet.facing * speed * dt;
      if (pet.x <= 0) {
        pet.x = 0;
        pet.facing = 1;
      } else if (pet.x >= edge) {
        pet.x = edge;
        pet.facing = -1;
      }
    }
  }
}
