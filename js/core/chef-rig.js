import * as THREE from '../../vendor/three.module.js';

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export const CHEF_CONFIGS = {
  fatsio: {
    skin: 0xeab98c, hair: 0x5a3a1e, shirt: 0xf5efe0, pants: 0x8a5a2e,
    boots: 0x5a3a20, extra: 'scarf', torsoW: 1.28, torsoH: 0.95, scale: 1.06,
  },
  dinnerette: {
    skin: 0xd99a66, hair: 0x4a2c14, shirt: 0xf2e0a8, pants: 0xe8c860,
    boots: 0x8a5a30, extra: 'tiara', torsoW: 0.92, torsoH: 0.9, scale: 1.0, dress: true, longHair: true,
  },
  chefno: {
    skin: 0xeab98c, hair: 0x6a4526, shirt: 0xf5efe0, pants: 0x3f7d3b,
    boots: 0x8a5a30, extra: 'hat', torsoW: 0.88, torsoH: 0.85, scale: 0.94, apron: true,
  },
};

export function limb(joint, len, r, color, bootColor) {
  // pivot group at the joint; geometry hangs below it
  const g = new THREE.Group();
  const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat(color));
  seg.position.y = -len / 2;
  seg.castShadow = true;
  g.add(seg);
  if (bootColor) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(r * 2.4, r * 1.6, r * 3.2), mat(bootColor));
    boot.position.set(0, -len - r * 0.5, r * 0.6);
    boot.castShadow = true;
    g.add(boot);
  } else {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 8, 6), mat(0xeab98c));
    hand.position.y = -len - r * 0.4;
    g.add(hand);
  }
  g.position.copy(joint);
  return g;
}

export function buildChef(id) {
  const c = CHEF_CONFIGS[id] || CHEF_CONFIGS.fatsio;
  const g = new THREE.Group();

  const legL = limb(new THREE.Vector3(-0.2, 0.72, 0), 0.5, 0.13, c.pants, c.boots);
  const legR = limb(new THREE.Vector3(0.2, 0.72, 0), 0.5, 0.13, c.pants, c.boots);
  g.add(legL, legR);

  let torso;
  if (c.dress) {
    torso = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.95, 10), mat(c.pants));
    torso.position.y = 0.95;
    const bodice = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(c.shirt));
    bodice.position.y = 1.32; bodice.scale.y = 0.9; bodice.castShadow = true;
    g.add(bodice);
  } else {
    torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), mat(c.shirt));
    torso.position.y = 1.08;
    torso.scale.set(c.torsoW, c.torsoH, 0.92);
  }
  torso.castShadow = true;
  g.add(torso);
  if (c.apron) {
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.1), mat(0x4a9448));
    apron.position.set(0, 0.98, 0.42);
    g.add(apron);
  }

  const armL = limb(new THREE.Vector3(-0.52 * c.torsoW, 1.38, 0), 0.42, 0.1, c.shirt);
  const armR = limb(new THREE.Vector3(0.52 * c.torsoW, 1.38, 0), 0.42, 0.1, c.shirt);
  g.add(armL, armR);

  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), mat(c.skin));
  skull.castShadow = true;
  head.add(skull);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), mat(c.hair));
  hairCap.position.y = 0.05;
  head.add(hairCap);
  if (c.longHair) {
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat(c.hair));
    back.position.set(0, -0.18, -0.26); back.scale.set(1, 1.7, 0.8);
    head.add(back);
  }
  for (const dx of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(0x3a2418));
    eye.position.set(dx, 0.03, 0.32);
    head.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(c.skin));
  nose.position.set(0, -0.06, 0.36);
  head.add(nose);

  if (c.extra === 'scarf') {
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.09, 8, 14), mat(0xd8402a));
    scarf.position.y = -0.3; scarf.rotation.x = Math.PI / 2;
    head.add(scarf);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 6), mat(0xd8402a));
    tail.position.set(0.16, -0.5, 0.22); tail.rotation.z = 0.4;
    head.add(tail);
  } else if (c.extra === 'tiara') {
    const tiara = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.7, roughness: 0.3 }));
    tiara.position.y = 0.26; tiara.rotation.x = Math.PI / 2.6;
    head.add(tiara);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), mat(0xd8402a));
    gem.position.set(0, 0.33, 0.18);
    head.add(gem);
  } else if (c.extra === 'hat') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.26, 10), mat(0xffffff));
    band.position.y = 0.32;
    head.add(band);
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), mat(0xffffff));
    puff.position.y = 0.56; puff.scale.y = 0.75; puff.castShadow = true;
    head.add(puff);
  }
  head.position.y = 1.85;
  head.scale.setScalar(1.18);   // chibi proportions: big head reads storybook-cute
  g.add(head);

  g.scale.setScalar(c.scale);
  g.userData = { legL, legR, armL, armR, torso, head, torsoBaseY: torso.scale.y };
  return g;
}

export function animateChefRig(rig, player, elapsed, dt, baseSpeed) {
  const R = rig, P = player, U = R.userData;
  R.position.set(P.pos.x, P.pos.y, 0);
  const targetYaw = P.facing >= 0 ? 1.15 : Math.PI - 1.15;
  R.rotation.y += (targetYaw - R.rotation.y) * Math.min(1, dt * 12);
  const runAmt = Math.min(1, Math.abs(P.vel.x) / baseSpeed);
  if (!P.grounded) {
    U.legL.rotation.x += (0.7 - U.legL.rotation.x) * dt * 14;
    U.legR.rotation.x += (-0.9 - U.legR.rotation.x) * dt * 14;
    U.armL.rotation.z += (2.4 - U.armL.rotation.z) * dt * 10;
    U.armR.rotation.z += (-2.4 - U.armR.rotation.z) * dt * 10;
    U.torso.rotation.x = 0.12;
  } else if (runAmt > 0.12) {
    const t = elapsed * 13 * (0.6 + runAmt * 0.6);
    U.legL.rotation.x = Math.sin(t) * 0.95 * runAmt;
    U.legR.rotation.x = -Math.sin(t) * 0.95 * runAmt;
    U.armL.rotation.x = -Math.sin(t) * 0.8 * runAmt;
    U.armR.rotation.x = Math.sin(t) * 0.8 * runAmt;
    U.armL.rotation.z += (0.25 - U.armL.rotation.z) * dt * 10;
    U.armR.rotation.z += (-0.25 - U.armR.rotation.z) * dt * 10;
    U.torso.rotation.x = 0.14 * runAmt;
    R.position.y += Math.abs(Math.sin(t)) * 0.09 * runAmt;
    U.head.rotation.x = Math.sin(t * 2) * 0.03;
  } else {
    const b = Math.sin(elapsed * 2.4);
    U.legL.rotation.x *= 0.85; U.legR.rotation.x *= 0.85;
    U.armL.rotation.x *= 0.85; U.armR.rotation.x *= 0.85;
    U.armL.rotation.z += (0.12 - U.armL.rotation.z) * dt * 6;
    U.armR.rotation.z += (-0.12 - U.armR.rotation.z) * dt * 6;
    U.torso.rotation.x = 0;
    U.torso.scale.y += (U.torsoBaseY * (1 + b * 0.015) - U.torso.scale.y) * dt * 8;
    U.head.rotation.x = b * 0.03;
  }
  R.visible = player.invuln > 0 ? Math.sin(elapsed * 30) > 0 : true;
}
