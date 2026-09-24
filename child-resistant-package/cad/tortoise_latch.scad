// TortoiseLatch: parametric concept model of a slow-push child-resistant latch
// and a reference package (hinged-lid tub) that carries it.
//
// Units are mm. Latch-cassette coordinates: X to the right, Y into the package,
// Z up. The cassette's front face is at Y = 0 and its bottom at Z = 0.
// Seen from the front, positive angles are counter-clockwise (see rot_front).
//
// This is a concept and prototype model. Its dimensions agree with each other
// and with sim/governor.py, but no part has been printed or tested yet.
// See ../README.md for how the mechanism works.
//
// Render examples (see render.sh):
//   openscad -D 'part="assembly"' tortoise_latch.scad
//   openscad -D 'part="governor"' -D slide=6 -D tripped=true tortoise_latch.scad
//   openscad -D 'part="slider"' -o slider.stl tortoise_latch.scad

/* [View] */
// assembly | exploded | cassette | governor | frame | back_cover | slider | carrier | tub | lid | damper
part = "assembly";
// Slider travel shown (0 .. stroke)
slide = 0;
// Show the governor carrier in its tripped (blocking) position
tripped = false;
// Show the thumb pad pressed in (home detent released)
pressed = false;
// Lid opening angle (deg)
lid_angle = 0;

/* [Kinematics: keep in sync with sim/governor.py] */
stroke = 12;
unlock_at = 11.2;
gear_m = 0.5;                         // rack / pinion module
pinion_teeth = 12;
pinion_r = gear_m * pinion_teeth / 2; // pitch radius 3.0
ratchet_pitch = 0.8;
ratchet_h = 0.6;
trip_rot = 7;                         // carrier swing, disarmed -> tripped (deg)
press_travel = 1.0;                   // press-in travel that clears the home pocket

/* [Cassette] */
cas_w = 40;
cas_d = 20;
cas_h = 52;
wall = 1.6;
clr = 0.3;

/* [Package] */
tub = [92, 66, 74];
tub_wall = 2.0;
tub_r = 6;
cas_z0 = tub[2] - cas_h;              // cassette sits flush with the rim

$fn = 40;
eps = 0.01;

// ---------------------------------------------------------------------------
// Derived layout (home position, cassette coordinates)
// ---------------------------------------------------------------------------
sl_x = [-6, 6];
sl_y = [2.0, 7.0];
sl_mid = 4.5;                          // rack layer in front, ratchet layer behind
sl_z = [4, 29.5];
root_x = sl_x[0];
pitch_x = root_x - 1.25 * gear_m;      // rack pitch line
axis = [pitch_x - pinion_r, 27];       // damper / pinion / carrier axis (X, Z)
rack_z0 = axis[1] - 9 * PI * gear_m;   // tooth gap faces the pinion at home
rack_n = 10;
ratchet_z = [8.5, 20.5];
lug_z = [20.58, 22.6];                 // reset lug: re-arms the carrier at home
horn = [[-3, 3], [3.3, 4.3], [sl_z[1], 32.0]];   // pushes the lid barb off its ledge
boss = [[0.4, 4.0], [7.0, 11.2], [4, 7]];        // return-spring seat
spring_top = 44;

// Thumb button (pad + stem + detent ears), rides on a flexure in the slider
stem = [[-3.6, 3.6], [-1.2, 2.0], [5, 13.5]];
ear = [[-5.0, 5.0], [0.9, 2.0], [5, 6.5]];
win = [[-4.0, 4.0], [4.6, stem[2][1] + stroke + 0.5]];
pad = [[-11, 11], [-4.2, -1.2], [2.3, 16.3]];

// Lid tongue and barb
tongue_x = [-5, 5];
tongue_y = [3.4, 4.8];
ledge = [[-6, 6], [wall, 3.2], [44, 45.6]];
barb_bot = 41.8;

// Damper (commodity one-way gear damper: placeholder dimensions)
damper_d = 12;
damper_y = [8.2, 16.4];
pinion_y = [2.1, 4.4];

// Carrier
car_plate_y = [4.8, 8.2];
finger_y = [4.8, 6.9];
finger_r = 6.6;
finger_ang = -67;                      // disarmed; pawl tip clears the ratchet by ~0.2
tail_ang = 112;                        // memory tail, armed
tail_r = 10.8;                         // radius of the tail tip centre
tail_tip = 1.1;                        // tail tip radius
detent_ang = tail_ang + trip_rot / 2;  // over-centre point of the memory detent
detent_bump = 0.8;
// Bump just clears the tail tip (0.05) at both rest positions and overlaps it
// mid-swing: an over-centre detent. Holding force comes from the leaf preload.
detent_r = 12.615;
stop_post = 0.6;                       // radius of the armed / tripped stop posts
car_rot = tripped ? trip_rot : 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
module box(x, y, z) {
    translate([x[0], y[0], z[0]]) cube([x[1] - x[0], y[1] - y[0], z[1] - z[0]]);
}

// Extrude a 2D profile drawn in (X, Z) between Y = y0 and Y = y1.
module xz(y0, y1) {
    translate([0, y1, 0]) rotate([90, 0, 0]) linear_extrude(y1 - y0) children();
}

// Extrude a 2D profile drawn in (Y, Z) between X = x0 and X = x1.
module yz(x0, x1) {
    translate([x0, 0, 0]) rotate([90, 0, 90]) linear_extrude(x1 - x0) children();
}

// Counter-clockwise rotation as seen from the front, about point c = [X, Z].
module rot_front(a, c) {
    translate([c[0], 0, c[1]]) rotate([0, -a, 0]) translate([-c[0], 0, -c[1]]) children();
}

module rounded_rect(size, r) {
    offset(r) offset(-r) square(size);
}

module hexagon(r) { circle(r, $fn = 6); }

// ---------------------------------------------------------------------------
// Slider: rack, ratchet, reset lug, lid-release horn, spring seat, thumb button
// ---------------------------------------------------------------------------
module rack_profile() {
    p = PI * gear_m;
    for (i = [0 : rack_n - 1]) {
        zc = rack_z0 + (i + 0.5) * p;
        polygon([[root_x + eps, zc - 0.62], [root_x - 2.25 * gear_m, zc - 0.21],
                 [root_x - 2.25 * gear_m, zc + 0.21], [root_x + eps, zc + 0.62]]);
    }
}

// Saw-tooth: flat upper faces block upward travel, sloped lower faces let the
// slider return downward past the pawl.
module ratchet_profile() {
    n = floor((ratchet_z[1] - ratchet_z[0]) / ratchet_pitch);
    z0 = ratchet_z[0];
    teeth = [for (i = [0 : n - 1]) each [[root_x - ratchet_h, z0 + (i + 1) * ratchet_pitch],
                                         [root_x, z0 + (i + 1) * ratchet_pitch]]];
    polygon(concat([[root_x + 0.3, z0], [root_x, z0]], teeth, [[root_x + 0.3, z0 + n * ratchet_pitch]]));
}

module reset_lug_profile() {
    // Lower face slopes down to the right, so on the way home it pushes a
    // tripped pawl tip left (clockwise) past the detent's over-centre point.
    polygon([[root_x + eps, lug_z[0]], [root_x - 0.7, lug_z[0] + 0.75],
             [root_x - 0.7, lug_z[1]], [root_x + eps, lug_z[1]]]);
}

module turtle_relief() {
    // Tactile "go slow" cue: shell of hexagons, head pointing the way to slide.
    scale([1, 1.22]) circle(4.6);
    translate([0, 7.0]) circle(1.5);
    for (sx = [-1, 1], sz = [-1, 1]) translate([sx * 4.3, sz * 3.9]) circle(1.1);
    translate([0, -6.6]) circle(0.7);
}

module turtle_shell_lines() {
    for (p = [[0, 0], [0, 2.9], [0, -2.9], [2.5, 1.45], [-2.5, 1.45], [2.5, -1.45], [-2.5, -1.45]])
        translate(p) difference() { hexagon(1.55); hexagon(1.15); }
}

module thumb_button() {
    // Stem through the front window, with ears that sit in the home pocket.
    box(stem[0], stem[1], stem[2]);
    box(ear[0], ear[1], ear[2]);
    // Pad with concave-ish rim and turtle relief
    difference() {
        translate([0, 0, 0]) xz(pad[1][0], pad[1][1])
            translate([pad[0][0], pad[2][0]])
                rounded_rect([pad[0][1] - pad[0][0], pad[2][1] - pad[2][0]], 3);
    }
    zc = (pad[2][0] + pad[2][1]) / 2 - 0.4;
    color("#15803d") translate([0, 0, zc]) xz(pad[1][0] - 0.5, pad[1][0] + eps) turtle_relief();
    color("#bbf7d0") translate([0, 0, zc]) xz(pad[1][0] - 0.8, pad[1][0] - 0.5 + eps) turtle_shell_lines();
    // Flexure strip joining the button to the slider plate
    box([-2.5, 2.5], [2.0, 2.6], [stem[2][1] - 1, stem[2][1] + 1.6]);
}

module slider_back_layer() {
    box(sl_x, [sl_mid, sl_y[1]], sl_z);
    xz(sl_mid, sl_y[1]) ratchet_profile();
    xz(sl_mid, sl_y[1]) reset_lug_profile();
    box(boss[0], boss[1], boss[2]);
}

module slider_body() {
    difference() {
        box(sl_x, sl_y, sl_z);
        // pocket that lets the thumb button press inward
        box([ear[0][0] - clr, ear[0][1] + clr], [sl_y[0] - eps, sl_y[0] + press_travel + 0.4],
            [stem[2][0] - 0.5, stem[2][1] - 1]);
    }
    xz(sl_y[0], sl_mid) rack_profile();
    xz(sl_mid, sl_y[1]) ratchet_profile();
    xz(sl_mid, sl_y[1]) reset_lug_profile();
    box(horn[0], horn[1], horn[2]);
    box(boss[0], boss[1], boss[2]);
    translate([(boss[0][0] + boss[0][1]) / 2, (boss[1][0] + boss[1][1]) / 2, boss[2][1]])
        cylinder(d = 2.4, h = 2.5);
}

module slider() {
    color("#2563eb") slider_body();
    color("#1d4ed8") translate([0, pressed ? press_travel : 0, 0]) thumb_button();
}

// ---------------------------------------------------------------------------
// Commodity parts: one-way rotary gear damper, return spring
// ---------------------------------------------------------------------------
module pinion_profile() {
    ro = (pinion_teeth + 2) * gear_m / 2;
    rr = (pinion_teeth - 2.5) * gear_m / 2;
    circle(rr, $fn = 36);
    for (k = [0 : pinion_teeth - 1]) rotate(k * 360 / pinion_teeth)
        polygon([[rr - 0.1, -0.5], [ro, -0.2], [ro, 0.2], [rr - 0.1, 0.5]]);
}

module damper() {
    spin = slide / pinion_r * 180 / PI;
    // body + flange rotate with the carrier; the shaft and pinion are driven by the rack
    rot_front(car_rot, axis) {
        color("#374151") translate([axis[0], damper_y[0], axis[1]]) rotate([-90, 0, 0])
            cylinder(d = damper_d, h = damper_y[1] - damper_y[0]);
        color("#4b5563") translate([axis[0], damper_y[1], axis[1]]) rotate([-90, 0, 0])
            difference() {
                hull() for (s = [-1, 1]) translate([0, s * 5.2, 0]) cylinder(d = 5, h = 0.8);
                for (s = [-1, 1]) translate([0, s * 5.2, -1]) cylinder(d = 1.8, h = 3);
            }
    }
    color("#9ca3af") translate([axis[0], pinion_y[1], axis[1]]) rotate([-90, 0, 0])
        cylinder(d = 2.0, h = damper_y[0] - pinion_y[1] + eps);
    color("#111827") rot_front(spin, axis)
        translate([axis[0], 0, axis[1]]) xz(pinion_y[0], pinion_y[1]) pinion_profile();
}

module coil(d, wire, z0, z1, turns) {
    pitch = (z1 - z0) / turns;
    for (i = [0 : turns - 1]) translate([0, 0, z0 + (i + 0.5) * pitch])
        rotate([atan(pitch / (PI * d)), 0, 0])
            rotate_extrude($fn = 24) translate([d / 2 - wire / 2, 0]) circle(d = wire, $fn = 8);
}

module return_spring() {
    color("#d1d5db") translate([(boss[0][0] + boss[0][1]) / 2, (boss[1][0] + boss[1][1]) / 2, 0])
        coil(3.4, 0.45, boss[2][1] + slide, spring_top, 16);
}

// ---------------------------------------------------------------------------
// Governor carrier: holds the damper body, pivots on the damper axis.
// Damper reaction torque swings it CCW; past the detent it latches TRIPPED and
// its pawl finger drops into the slider's ratchet.
// ---------------------------------------------------------------------------
module carrier_plate_profile() {
    difference() {
        intersection() {
            translate([axis[0], axis[1]]) circle(7.5);
            translate([-50, -50]) square([axis[0] + 2.3 + 50, 150]);
        }
        translate([axis[0], axis[1]]) circle(d = 3.0);
    }
    // memory tail (bistable detent follower)
    translate([axis[0], axis[1]]) rotate(tail_ang) {
        translate([6.5, -tail_tip]) square([tail_r - 6.5, 2 * tail_tip]);
        translate([tail_r, 0]) circle(tail_tip);
    }
}

// Preload flexure: a slender beam that bears on a frame post and resists the
// trip rotation. Drawn undeflected (zero preload); see README for the preload.
module preload_flexure_profile() {
    translate([axis[0], axis[1]]) rotate(215) translate([7.0, 0]) rotate(55)
        translate([0, -0.4]) square([8.0, 0.8]);
}

module finger_profile() {
    translate([axis[0], axis[1]]) rotate(finger_ang) {
        translate([1.2, -1.0]) square([finger_r - 1.2, 0.95]);
        // pawl tooth; its end face bears on the ratchet's flat upper faces
        polygon([[finger_r - 1.2, -0.05], [finger_r, -0.05], [finger_r, 0.25]]);
    }
}

module carrier(rigid_only = false) {
    color("#f97316") rot_front(car_rot, axis) {
        xz(car_plate_y[0] + 1.0, car_plate_y[1]) carrier_plate_profile();
        if (!rigid_only) xz(car_plate_y[0] + 1.0, car_plate_y[1]) preload_flexure_profile();
        color("#9a3412") xz(finger_y[0], finger_y[1]) finger_profile();
        // ring that clamps the damper body
        translate([axis[0], car_plate_y[1] - eps, axis[1]]) rotate([-90, 0, 0])
            difference() {
                cylinder(d = 15.0, h = 16.0 - car_plate_y[1]);
                translate([0, 0, -1]) cylinder(d = damper_d + 0.2, h = 20);
            }
    }
}

// ---------------------------------------------------------------------------
// Frame (cassette housing) and back cover
// ---------------------------------------------------------------------------
tube_y = [9.0, cas_d - 1.6];

module frame_shell(front = true) {
    difference() {
        box([-cas_w / 2, cas_w / 2], [0, cas_d - 1.6], [0, cas_h]);
        box([-cas_w / 2 + wall, cas_w / 2 - wall], [front ? wall : -1, cas_d], [wall, cas_h - wall]);
        // thumb window + home pocket for the button ears
        box(win[0], [-1, wall + 1], win[1]);
        box([ear[0][0] - clr, ear[0][1] + clr], [ear[1][0] - clr, wall + eps],
            [ear[2][0] - clr, ear[2][1] + clr]);
        // slot for the lid tongue
        box([tongue_x[0] - 0.4, tongue_x[1] + 0.4], [1.9, 7.3], [cas_h - wall - 1, cas_h + 1]);
    }
    // raised "slide up" chevrons beside the window (tactile as well as visual)
    if (front) for (sx = [-1, 1], i = [0 : 2])
        translate([sx * 15.5, 0, 24 + i * 6]) xz(-0.5, eps)
            polygon([[-3, 0], [0, 2.6], [3, 0], [3, -1.2], [0, 1.4], [-3, -1.2]]);
}

module frame_features() {
    // ledge under which the lid barb hooks
    box(ledge[0], ledge[1], ledge[2]);
    // right rail (C-channel) and back lips that hold the slider
    box([sl_x[1] + clr, sl_x[1] + 2.3], [wall - eps, 8.6], [2, 45]);
    box([4.4, sl_x[1] + 2.3], [sl_y[1] + clr, 8.6], [2, 45]);
    box([-3.4, -1.0], [sl_y[1] + clr, 8.6], [wall - eps, 18]);
    // bearing tube for the carrier ring
    translate([axis[0], tube_y[0], axis[1]]) rotate([-90, 0, 0])
        difference() {
            cylinder(d = 18.6, h = tube_y[1] - tube_y[0]);
            translate([0, 0, -1]) cylinder(d = 15.8, h = 30);
        }
    // spring bracket
    box(boss[0], [7.6, 11.4], [spring_top, cas_h - wall + eps]);
    // preload post (the carrier flexure bears on it)
    box([-14.9, -13.3], [wall - eps, car_plate_y[1]], [13.6, 16.2]);
    // hard stops either side of the memory tail: armed (CW) and tripped (CCW)
    for (st = [[tail_ang, 1], [tail_ang + trip_rot, -1]]) {
        a = st[0];
        c = [axis[0] + tail_r * cos(a), axis[1] + tail_r * sin(a)];
        d = tail_tip + 0.05 + stop_post;
        p = c + st[1] * d * [sin(a), -cos(a)];
        translate([p[0], wall - eps, p[1]]) rotate([-90, 0, 0])
            cylinder(r = stop_post, h = car_plate_y[1] - wall + eps);
    }
    // detent leaf: cantilever from the left wall with a bump on the tail tip
    bump = [axis[0] + detent_r * cos(detent_ang), axis[1] + detent_r * sin(detent_ang)];
    box([-cas_w / 2 + wall - eps, bump[0]], [car_plate_y[0] + 1.0, car_plate_y[1]],
        [bump[1] + 0.2, bump[1] + 1.0]);
    translate([bump[0], car_plate_y[0] + 1.0, bump[1]]) rotate([-90, 0, 0])
        cylinder(r = detent_bump, h = car_plate_y[1] - car_plate_y[0] - 1.0);
    // snap latches that retain the cassette in the package bay
    for (sx = [-1, 1]) translate([sx * cas_w / 2, 12, 20])
        yz(sx < 0 ? -0.8 : 0, sx < 0 ? 0 : 0.8) polygon([[-2, 0], [2, 0], [0, 6]]);
}

module frame() {
    color("#e5e7eb") { frame_shell(); frame_features(); }
}

module back_cover() {
    color("#d1d5db") difference() {
        box([-cas_w / 2, cas_w / 2], [cas_d - 1.6, cas_d], [0, cas_h]);
        for (s = [-1, 1]) translate([axis[0], cas_d - 2, axis[1] + s * 5.2])
            rotate([-90, 0, 0]) cylinder(d = 1.8, h = 3);
    }
}

// ---------------------------------------------------------------------------
// Package: tub with a bay for the cassette, and a hinged lid with the tongue
// ---------------------------------------------------------------------------
module tub_outline(inset = 0) {
    translate([-tub[0] / 2 + inset, inset]) rounded_rect([tub[0] - 2 * inset, tub[1] - 2 * inset], tub_r - inset);
}

bay = [[-cas_w / 2 - 0.2, cas_w / 2 + 0.2], [0, cas_d + 0.2]];
hinge_yz = [0, tub[1] + 2.5, tub[2] + 1.5];

module tub_body() {
    difference() {
        union() {
            difference() {
                linear_extrude(tub[2]) tub_outline();
                translate([0, 0, tub_wall]) linear_extrude(tub[2]) tub_outline(tub_wall);
            }
            // walls around the cassette bay
            box([bay[0][0] - 2, bay[0][1] + 2], [0, bay[1][1] + 2], [cas_z0 - 2, tub[2]]);
            // rear hinge knuckles
            for (x = [-36, -12, 12, 36]) translate([x - 4, 0, 0]) hull() {
                translate([0, tub[1] - 0.5, tub[2] - 6]) cube([8, 0.5, 4]);
                translate(hinge_yz) rotate([0, 90, 0]) cylinder(d = 5, h = 8);
            }
        }
        box(bay[0], [-1, bay[1][1]], [cas_z0, tub[2] + 1]);
        translate([-tub[0] / 2, 0, 0] + hinge_yz) rotate([0, 90, 0]) cylinder(d = 2.2, h = tub[0]);
        // snap windows for the cassette
        for (sx = [-1, 1]) translate([sx * (cas_w / 2 + 1), 12, cas_z0 + 23]) cube([3, 5, 5], center = true);
        // instruction deboss below the latch
        translate([0, -eps, cas_z0 - 8]) rotate([90, 0, 0]) linear_extrude(0.6, center = true)
            text("PRESS  ·  SLIDE UP SLOWLY", size = 4, font = "Liberation Sans:style=Bold",
                 halign = "center", valign = "center");
        translate([0, -eps, cas_z0 - 15]) rotate([90, 0, 0]) linear_extrude(0.6, center = true)
            text("push hard and it locks — let go to reset", size = 2.8,
                 font = "Liberation Sans", halign = "center", valign = "center");
    }
}

module lid_body() {
    // flush plate, plug skirt, rear knuckles
    translate([0, 0, tub[2]]) linear_extrude(3) tub_outline();
    difference() {
        translate([0, 0, tub[2] - 4]) linear_extrude(4) difference() {
            tub_outline(tub_wall + 0.3);
            tub_outline(tub_wall + 1.7);
        }
        box([bay[0][0] - 2.5, bay[0][1] + 2.5], [-1, bay[1][1] + 2.5], [tub[2] - 5, tub[2] + eps]);
    }
    difference() {
        for (x = [-24, 0, 24]) translate([x - 4, 0, 0]) hull() {
            translate([0, tub[1] - 1, tub[2]]) cube([8, 1, 3]);
            translate(hinge_yz) rotate([0, 90, 0]) cylinder(d = 5, h = 8);
        }
        translate([-tub[0] / 2, 0, 0] + hinge_yz) rotate([0, 90, 0]) cylinder(d = 2.2, h = tub[0]);
    }
    translate([0, 0, cas_z0]) lid_tongue();
}

// Tongue with barb, in cassette coordinates. The barb hooks under the frame
// ledge; its lower chamfer lets it snap past the ledge when the lid is shut
// and is where the slider's horn pushes it back to release the lid.
module lid_tongue() {
    box(tongue_x, tongue_y, [barb_bot, cas_h + eps]);
    yz(tongue_x[0], tongue_x[1])
        polygon([[tongue_y[0] + eps, barb_bot], [2.0, barb_bot + 1.4], [2.0, ledge[2][0] - 0.05],
                 [tongue_y[0] + eps, ledge[2][0] - 0.05]]);
}

module lid() {
    color("#99f6e4") translate(hinge_yz) rotate([-lid_angle, 0, 0]) translate(-hinge_yz) lid_body();
}

module tub() { color("#f0fdfa") tub_body(); }

// ---------------------------------------------------------------------------
// Assemblies
// ---------------------------------------------------------------------------
module moving_parts() {
    translate([0, 0, slide]) { slider(); }
    carrier();
    damper();
    return_spring();
}

module cassette() {
    frame();
    back_cover();
    moving_parts();
}

// Front view of the governor layer: front wall, rack layer and thumb button
// removed; the pinion is drawn translucent so the pawl finger shows through.
module governor_section() {
    color("#cbd5e1") { frame_shell(front = false); frame_features(); }
    color("#2563eb") translate([0, 0, slide]) slider_back_layer();
    color("#60a5fa") translate([0, 0, slide]) box(horn[0], horn[1], horn[2]);
    carrier();
    return_spring();
    if (slide < unlock_at) color("#14b8a6") lid_tongue();
    spin = slide / pinion_r * 180 / PI;
    color("#111827", 0.35) rot_front(spin, axis)
        translate([axis[0], 0, axis[1]]) xz(pinion_y[0], pinion_y[1]) pinion_profile();
}

module exploded() {
    // Parts go into the open back of the frame, then the cassette snaps into the tub.
    translate([-150, -60, cas_z0]) frame();
    translate([-110, -40, cas_z0]) translate([0, 0, slide]) slider();
    translate([-88, -30, cas_z0]) return_spring();
    translate([-70, -20, cas_z0]) carrier();
    translate([-48, -10, cas_z0]) damper();
    translate([-22, 0, cas_z0]) back_cover();
    translate([50, 40, 0]) tub();
    translate([50, 40, 40]) lid();
}

if (part == "assembly") {
    tub();
    lid();
    translate([0, 0, cas_z0]) cassette();
} else if (part == "exploded") {
    exploded();
} else if (part == "cassette") {
    cassette();
} else if (part == "governor") {
    governor_section();
} else if (part == "frame") {
    frame_shell(); frame_features();
} else if (part == "back_cover") {
    back_cover();
} else if (part == "slider") {
    slider_body(); thumb_button();
} else if (part == "carrier") {
    carrier();
} else if (part == "tub") {
    tub_body();
} else if (part == "lid") {
    lid_body();
} else if (part == "damper") {
    damper();
}
