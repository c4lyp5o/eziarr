// Shared motion vocabulary. Motion is feedback: a press, a sheet opening, a
// row arriving or leaving, live progress. Transform and opacity only;
// <MotionConfig reducedMotion="user"> in main.jsx drops the travel for
// people who ask for less motion.

export const spring = {
	type: "spring",
	stiffness: 520,
	damping: 38,
	mass: 0.8,
};
export const softSpring = { type: "spring", stiffness: 280, damping: 32 };
export const ease = [0.22, 1, 0.36, 1];

// Hover/press feedback for anything clickable.
export const press = {
	whileHover: { scale: 1.03 },
	whileTap: { scale: 0.96 },
	transition: spring,
};

// A row arriving in, or leaving, a live list (tasks, queue, history).
export const rowMotion = {
	layout: true,
	initial: { opacity: 0, y: 12 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, x: -24, transition: { duration: 0.16 } },
	transition: spring,
};
