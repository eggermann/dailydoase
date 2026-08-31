// b1aaf247 imports this helper but the historical commit does not contain it.
// Keep the historical runtime viable by always allowing the existing vision
// check; do not introduce the later d6 camera-difference policy here.
export const createCameraChangeGate = () => ({
  evaluate: async () => ({
    shouldCheckVision: true,
    reason: 'legacy-direct-vision',
  }),
  recordVisionDecision: () => {},
});

export default { createCameraChangeGate };
