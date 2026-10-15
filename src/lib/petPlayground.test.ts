import { describe, expect, it } from "vitest";
import { PetPlayground } from "./petPlayground";

function playground(random: () => number = () => 0.6) {
  const world = new PetPlayground(random);
  world.resize(800, 1);
  return world;
}

describe("pet ledge movement", () => {
  it("spawns across the ledge and preserves existing pets when adding another", () => {
    const rolls = [0.1, 0.9, 0.5, 0.9, 0.1, 0.5];
    const world = playground(() => rolls.shift() ?? 0.5);
    world.syncPets([{ id: "cat", width: 40 }]);
    expect(world.pets[0].x).toBeCloseTo(76);
    const first = world.pets[0];
    world.syncPets([
      { id: "cat", width: 40 },
      { id: "dog", width: 40 },
    ]);
    expect(world.pets[0]).toBe(first);
    expect(world.pets[1].x).toBeCloseTo(684);
  });

  it("walks to the far end of a wide composer and turns without crossing its edge", () => {
    const world = playground();
    world.syncPets([{ id: "cat", width: 40 }]);
    Object.assign(world.pets[0], { x: 15, facing: 1, nextAction: Infinity });
    for (let i = 0; i < 800; i++) world.step(1 / 60);
    expect(world.pets[0].x).toBeGreaterThan(400);
    world.pets[0].x = 759;
    world.step(0.05);
    expect(world.pets[0].x).toBe(760);
    expect(world.pets[0].facing).toBe(-1);
  });

  it("keeps pets and balls inside the resized ledge", () => {
    const world = playground();
    world.syncPets([{ id: "cat", width: 40 }]);
    world.pets[0].x = 750;
    world.holdBall(795, 40);
    world.resize(120, 0.7);
    expect(world.pets[0].x).toBeLessThanOrEqual(80);
    expect(world.ball!.x).toBeLessThanOrEqual(120 - 2.8);
  });
});

describe("throwing balls", () => {
  it("follows the pointer while held, then launches in the drag direction", () => {
    const world = playground();
    world.holdBall(200, 30);
    world.step(0.05);
    expect(world.ball).toMatchObject({ x: 200, y: 30, held: true });
    world.holdBall(300, 80);
    world.releaseBall(100, 50, 0.2);
    world.step(0.05);
    expect(world.ball!.x).toBeGreaterThan(300);
    expect(world.ball!.y).toBeGreaterThan(80);
    expect(world.ball!.held).toBe(false);
  });

  it("tosses on a click instead of leaving a stationary ball", () => {
    const world = playground();
    world.holdBall(400, 30);
    world.releaseBall(0, 0, 0.1);
    world.step(0.05);
    expect(world.ball!.x).not.toBe(400);
    expect(world.ball!.y).toBeGreaterThan(30);
  });

  it("bounces off the side and floor", () => {
    const world = playground();
    world.holdBall(795, 4);
    world.releaseBall(100, -100, 0.1);
    world.step(0.05);
    expect(world.ball!.x).toBe(796);
    expect(world.ball!.vx).toBeLessThan(0);
    expect(world.ball!.y).toBe(4);
    expect(world.ball!.vy).toBeGreaterThan(0);
  });

  it("randomizes automatic throw positions", () => {
    let random = 0.2;
    const world = playground(() => random);
    world.throwRandomBall();
    expect(world.ball!.x).toBe(160);
    random = 0.8;
    world.throwRandomBall();
    expect(world.ball!.x).toBe(640);
  });

  it("pets chase a released ball and catch it on the ground", () => {
    const world = playground();
    world.syncPets([{ id: "cat", width: 40 }]);
    world.pets[0].x = 100;
    world.holdBall(600, 4);
    world.releaseBall(6, 0, 10);
    for (let i = 0; i < 300 && world.ball; i++) world.step(1 / 60);
    expect(world.ball).toBeNull();
    expect(world.pets[0].x).toBeGreaterThan(500);
    expect(world.pets[0].mode).toBe("with_ball");
    for (let i = 0; i < 150; i++) world.step(1 / 60);
    expect(world.pets[0].mode).not.toBe("with_ball");
  });
});
