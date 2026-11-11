export const EASE_QUINT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_STD: [number, number, number, number] = [0.4, 0, 0.2, 1];

export const SCROLL_SPRING = { stiffness: 80, damping: 24, mass: 0.6, restDelta: 0.0002 };

export const SPRING = {
  button: { type: "spring" as const, stiffness: 110, damping: 24, mass: 1.3 },
  camera: {
    type: "spring" as const,
    stiffness: 250,
    damping: 30,
    mass: 0.75,
    restDelta: 0.2,
    restSpeed: 0.2,
  },
  trace: {
    type: "spring" as const,
    stiffness: 700,
    damping: 58,
    mass: 0.2,
    restDelta: 0.0005,
    restSpeed: 0.005,
  },
  faqHeight: {
    type: "spring" as const,
    stiffness: 88,
    damping: 20.5,
    mass: 1.15,
    restDelta: 0.4,
    restSpeed: 0.4,
  },
  faqY: { type: "spring" as const, stiffness: 120, damping: 22, mass: 1, delay: 0.05 },
  icon: { type: "spring" as const, stiffness: 260, damping: 34, mass: 1 },
  row: { type: "spring" as const, stiffness: 140, damping: 24, mass: 0.9 },
  bar: { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.8 },
  slide: { type: "spring" as const, stiffness: 420, damping: 40, mass: 0.9 },
};
