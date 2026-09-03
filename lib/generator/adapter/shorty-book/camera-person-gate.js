// A usable camera frame may still show no person. Only a confirmed person
// releases the two-generation exhibition pause.
export const shouldResetPersonlessGenerationCount = ({ requirePerson, shot } = {}) => (
  !requirePerson || shot?.hasConfirmedPerson === true
);
