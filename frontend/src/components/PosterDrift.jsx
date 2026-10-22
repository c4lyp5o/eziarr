import { useEffect, useRef, useState } from "react";
import {
	Color,
	DoubleSide,
	Fog,
	InstancedMesh,
	MeshBasicMaterial,
	Object3D,
	PerspectiveCamera,
	Scene,
	Shape,
	ShapeGeometry,
	WebGLRenderer,
} from "three";

// A slow drift of blank poster cards toward the viewer: behind the sign-in
// form, and (calmer) behind "All caught up". Loaded lazily with those
// screens only, so the wall never downloads three.js. Decoration: it renders
// nothing without WebGL, holds still for reduced motion, and stops when the
// screen unmounts.

const NEAR = 1; // a card past this z recycles to the back...
const FADE = 7; // ...after fading out over this distance, so it never pops
const FAR = -44;
const CLEAR = 4.5; // keep the middle column free near the content

const MOODS = {
	login: { count: 120, speed: 1 }, // speed in units per second
	calm: { count: 60, speed: 0.45 },
};

const css = (name) =>
	getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const cardShape = () => {
	const w = 2;
	const h = 3;
	const r = 0.16;
	const s = new Shape();
	s.moveTo(-w / 2 + r, -h / 2);
	s.lineTo(w / 2 - r, -h / 2);
	s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
	s.lineTo(w / 2, h / 2 - r);
	s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
	s.lineTo(-w / 2 + r, h / 2);
	s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
	s.lineTo(-w / 2, -h / 2 + r);
	s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
	return new ShapeGeometry(s, 4);
};

const place = (card, z) => {
	let x;
	do x = (Math.random() - 0.5) * 30;
	while (Math.abs(x) < CLEAR && z > -14);
	card.x = x;
	card.y = (Math.random() - 0.5) * 18;
	card.z = z;
};

export default function PosterDrift({ mood = "login" }) {
	const hostRef = useRef(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const { count: COUNT, speed: SPEED } = MOODS[mood] ?? MOODS.login;
		const host = hostRef.current;
		let renderer;
		try {
			renderer = new WebGLRenderer({ antialias: true, alpha: false });
		} catch {
			return; // no WebGL: the plain ground stays
		}
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
		host.appendChild(renderer.domElement);

		const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const scene = new Scene();
		const camera = new PerspectiveCamera(50, 1, 0.1, 80);
		camera.position.set(0, 0, 10);

		const geometry = cardShape();
		const material = new MeshBasicMaterial({ side: DoubleSide });
		const mesh = new InstancedMesh(geometry, material, COUNT);
		scene.add(mesh);

		const cards = Array.from({ length: COUNT }, () => {
			const card = {
				phase: Math.random() * Math.PI * 2,
				tilt: (Math.random() - 0.5) * 0.5,
				accent: Math.random() < 0.05,
				shade: Math.random(),
				color: new Color(),
			};
			place(card, FAR + Math.random() * (NEAR - FAR));
			return card;
		});

		// Colours come from the theme tokens, so light and dark both work and
		// a theme change repaints the scene.
		const ground = new Color();
		const paint = () => {
			ground.set(css("--ground"));
			const raised = new Color(css("--raised"));
			const control = new Color(css("--control"));
			const accent = new Color(css("--accent"));
			renderer.setClearColor(ground);
			scene.fog = new Fog(ground, 8, 44);
			for (const card of cards) {
				if (card.accent) card.color.copy(accent).lerp(raised, 0.35);
				else card.color.copy(raised).lerp(control, card.shade * 0.35);
			}
		};
		paint();
		const themeWatch = new MutationObserver(() => {
			paint();
			if (still) draw(0);
		});
		themeWatch.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});

		const pointer = { x: 0, y: 0 };
		const onPointer = (e) => {
			pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
			pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
		};

		const dummy = new Object3D();
		const tint = new Color();
		const draw = (t) => {
			camera.position.x += (pointer.x * 1.4 - camera.position.x) * 0.04;
			camera.position.y += (-pointer.y * 0.9 - camera.position.y) * 0.04;
			camera.lookAt(0, 0, -12);
			cards.forEach((card, i) => {
				dummy.position.set(card.x, card.y, card.z);
				dummy.rotation.set(
					Math.sin(t * 0.3 + card.phase) * 0.12,
					card.tilt + Math.sin(t * 0.25 + card.phase) * 0.2,
					Math.sin(t * 0.2 + card.phase) * 0.05,
				);
				dummy.updateMatrix();
				mesh.setMatrixAt(i, dummy.matrix);
				const fade = Math.min(Math.max((card.z - (NEAR - FADE)) / FADE, 0), 1);
				mesh.setColorAt(i, tint.copy(card.color).lerp(ground, fade));
			});
			mesh.instanceMatrix.needsUpdate = true;
			mesh.instanceColor.needsUpdate = true;
			renderer.render(scene, camera);
		};

		const resize = () => {
			const { clientWidth: w, clientHeight: h } = host;
			renderer.setSize(w, h, false);
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			if (still) draw(0);
		};
		const sizeWatch = new ResizeObserver(resize);
		sizeWatch.observe(host);
		resize();

		let frame;
		if (!still) {
			window.addEventListener("pointermove", onPointer);
			let last = performance.now();
			const tick = (now) => {
				const dt = Math.min((now - last) / 1000, 0.1);
				last = now;
				for (const card of cards) {
					card.z += SPEED * dt;
					if (card.z > NEAR) place(card, FAR);
				}
				draw(now / 1000);
				frame = requestAnimationFrame(tick);
			};
			frame = requestAnimationFrame(tick);
		}
		setReady(true);

		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("pointermove", onPointer);
			themeWatch.disconnect();
			sizeWatch.disconnect();
			geometry.dispose();
			material.dispose();
			mesh.dispose();
			renderer.dispose();
			renderer.domElement.remove();
		};
	}, [mood]);

	return (
		<div
			ref={hostRef}
			aria-hidden="true"
			className={`fixed inset-0 pointer-events-none transition-opacity duration-1000 [&>canvas]:size-full ${ready ? "opacity-100" : "opacity-0"}`}
		/>
	);
}
