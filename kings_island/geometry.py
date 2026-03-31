"""Geometric primitives for building structures."""

import math
from kings_island.config import BLOCKS


def fill_box(writer, x1, y1, z1, x2, y2, z2, block):
    """Fill a rectangular box."""
    writer.fill(x1, y1, z1, x2, y2, z2, block)


def hollow_box(writer, x1, y1, z1, x2, y2, z2, block):
    """Fill a hollow rectangular box (shell only)."""
    writer.fill_hollow(x1, y1, z1, x2, y2, z2, block)


def floor_rect(writer, x1, z1, x2, z2, y, block):
    """Fill a single-layer floor rectangle."""
    writer.fill(x1, y, z1, x2, y, z2, block)


def wall(writer, x1, y1, z1, x2, y2, z2, block):
    """Build a wall (thin in one dimension)."""
    writer.fill(x1, y1, z1, x2, y2, z2, block)


def column(writer, x, z, y_base, y_top, block):
    """Build a vertical column."""
    writer.fill(x, y_base, z, x, y_top, z, block)


def circle_points(cx, cz, radius):
    """Generate integer coordinate points for a circle using midpoint algorithm."""
    points = set()
    x = radius
    z = 0
    d = 1 - radius

    while x >= z:
        points.add((cx + x, cz + z))
        points.add((cx - x, cz + z))
        points.add((cx + x, cz - z))
        points.add((cx - x, cz - z))
        points.add((cx + z, cz + x))
        points.add((cx - z, cz + x))
        points.add((cx + z, cz - x))
        points.add((cx - z, cz - x))
        z += 1
        if d < 0:
            d += 2 * z + 1
        else:
            x -= 1
            d += 2 * (z - x) + 1

    return points


def filled_circle_points(cx, cz, radius):
    """Generate all integer points inside a circle."""
    points = set()
    for x in range(cx - radius, cx + radius + 1):
        for z in range(cz - radius, cz + radius + 1):
            if (x - cx) ** 2 + (z - cz) ** 2 <= radius ** 2:
                points.add((x, z))
    return points


def cylinder(writer, cx, y_base, cz, radius, height, block, filled=True):
    """Build a vertical cylinder."""
    if filled:
        for dy in range(height):
            y = y_base + dy
            # Use fill commands for horizontal slices
            for x in range(cx - radius, cx + radius + 1):
                # Find z extent at this x
                dx = abs(x - cx)
                if dx > radius:
                    continue
                max_dz = int(math.sqrt(radius * radius - dx * dx))
                writer.fill(x, y, cz - max_dz, x, y, cz + max_dz, block)
    else:
        # Hollow cylinder - only the ring
        points = circle_points(cx, cz, radius)
        for dy in range(height):
            y = y_base + dy
            for px, pz in points:
                writer.setblock(px, y, pz, block)


def cylinder_fill(writer, cx, y_base, cz, radius, height, block):
    """Build a filled cylinder using efficient fill commands."""
    for dy in range(height):
        y = y_base + dy
        for x in range(cx - radius, cx + radius + 1):
            dx = abs(x - cx)
            if dx > radius:
                continue
            max_dz = int(math.sqrt(radius * radius - dx * dx))
            if max_dz >= 0:
                writer.fill(x, y, cz - max_dz, x, y, cz + max_dz, block)


def dome(writer, cx, y_base, cz, radius, block):
    """Build a hemisphere dome."""
    for dy in range(radius + 1):
        y = y_base + dy
        layer_r = int(math.sqrt(radius * radius - dy * dy))
        if layer_r > 0:
            cylinder(writer, cx, y, cz, layer_r, 1, block, filled=False)


def filled_dome(writer, cx, y_base, cz, radius, block):
    """Build a filled hemisphere dome."""
    for dy in range(radius + 1):
        y = y_base + dy
        layer_r = int(math.sqrt(radius * radius - dy * dy))
        if layer_r > 0:
            cylinder_fill(writer, cx, y, cz, layer_r, 1, block)


def sphere(writer, cx, cy, cz, radius, block, filled=False):
    """Build a sphere."""
    for dy in range(-radius, radius + 1):
        y = cy + dy
        layer_r = int(math.sqrt(radius * radius - dy * dy))
        if layer_r > 0:
            if filled:
                cylinder_fill(writer, cx, y, cz, layer_r, 1, block)
            else:
                cylinder(writer, cx, y, cz, layer_r, 1, block, filled=False)


def arch(writer, x, y_base, z, width, height, depth, block):
    """Build a parabolic arch along the X axis."""
    half_w = width // 2
    for dx in range(-half_w, half_w + 1):
        # Parabolic height
        h = int(height * (1 - (dx / half_w) ** 2))
        if h > 0:
            for dz in range(depth):
                writer.fill(x + dx, y_base, z + dz, x + dx, y_base + h, z + dz, block)


def catmull_rom_spline(points, num_segments=10):
    """Interpolate a Catmull-Rom spline through control points.

    Returns list of (x, y, z) float tuples along the curve.
    """
    if len(points) < 2:
        return list(points)

    result = []

    # Extend with phantom points
    extended = [points[0]] + list(points) + [points[-1]]

    for i in range(1, len(extended) - 2):
        p0 = extended[i - 1]
        p1 = extended[i]
        p2 = extended[i + 1]
        p3 = extended[i + 2]

        for t_step in range(num_segments):
            t = t_step / num_segments
            t2 = t * t
            t3 = t2 * t

            x = 0.5 * ((2 * p1[0]) +
                       (-p0[0] + p2[0]) * t +
                       (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                       (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)

            y = 0.5 * ((2 * p1[1]) +
                       (-p0[1] + p2[1]) * t +
                       (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                       (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)

            z = 0.5 * ((2 * p1[2]) +
                       (-p0[2] + p2[2]) * t +
                       (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 +
                       (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3)

            result.append((x, y, z))

    # Add final point
    result.append(points[-1])

    return result


def discretize_path(float_points):
    """Convert float path to unique integer block positions."""
    seen = set()
    result = []
    for fx, fy, fz in float_points:
        ix, iy, iz = int(round(fx)), int(round(fy)), int(round(fz))
        key = (ix, iy, iz)
        if key not in seen:
            seen.add(key)
            result.append(key)
    return result


def lattice_segment(writer, x, y_base, z, width, height, block, bar_block):
    """Build a lattice tower segment with cross-bracing."""
    w = width // 2

    # Four corner posts
    for dx, dz in [(-w, -w), (-w, w), (w, -w), (w, w)]:
        writer.fill(x + dx, y_base, z + dz, x + dx, y_base + height, z + dz, block)

    # Cross bracing on each face using bars
    mid_y = y_base + height // 2

    # X-facing sides
    for dz in [-w, w]:
        writer.setblock(x, mid_y, z + dz, bar_block)
        for dx in range(-w + 1, w):
            frac = abs(dx) / max(w, 1)
            brace_y = int(y_base + height * (0.5 - 0.3 * frac))
            writer.setblock(x + dx, brace_y, z + dz, bar_block)

    # Z-facing sides
    for dx in [-w, w]:
        writer.setblock(x + dx, mid_y, z, bar_block)
        for dz_i in range(-w + 1, w):
            frac = abs(dz_i) / max(w, 1)
            brace_y = int(y_base + height * (0.5 - 0.3 * frac))
            writer.setblock(x + dx, brace_y, z + dz_i, bar_block)

    # Horizontal rings at base, mid, top
    for ring_y in [y_base, mid_y, y_base + height]:
        writer.fill(x - w, ring_y, z - w, x + w, ring_y, z - w, bar_block)
        writer.fill(x - w, ring_y, z + w, x + w, ring_y, z + w, bar_block)
        writer.fill(x - w, ring_y, z - w, x - w, ring_y, z + w, bar_block)
        writer.fill(x + w, ring_y, z - w, x + w, ring_y, z + w, bar_block)


def pyramid(writer, cx, y_base, cz, base_size, height, block):
    """Build a pyramid."""
    for dy in range(height):
        y = y_base + dy
        shrink = int(dy * base_size / (2 * height))
        half = base_size // 2 - shrink
        if half >= 0:
            writer.fill(cx - half, y, cz - half, cx + half, y, cz + half, block)


def staircase(writer, x_start, y_start, z_start, direction, steps, block, slab_block=None):
    """Build a staircase in a given direction (+x, -x, +z, -z)."""
    dx, dz = {"x": (1, 0), "-x": (-1, 0), "z": (0, 1), "-z": (0, -1)}[direction]
    for i in range(steps):
        x = x_start + dx * i
        z = z_start + dz * i
        y = y_start + i
        writer.setblock(x, y, z, block)


def tree(writer, x, y, z, trunk_height=5, leaf_radius=3,
         trunk_block="minecraft:oak_log", leaf_block="minecraft:oak_leaves"):
    """Place a simple tree."""
    # Trunk
    writer.fill(x, y, z, x, y + trunk_height, z, trunk_block)
    # Leaves - spherical canopy
    leaf_y = y + trunk_height - 1
    for dy in range(-1, leaf_radius):
        ly = leaf_y + dy
        r = leaf_radius - abs(dy)
        if r > 0:
            for lx in range(x - r, x + r + 1):
                for lz in range(z - r, z + r + 1):
                    dist = math.sqrt((lx - x) ** 2 + (lz - z) ** 2)
                    if dist <= r + 0.5:
                        writer.setblock(lx, ly, lz, leaf_block)


def building_shell(writer, x1, y_base, z1, width, depth, height,
                   wall_block, floor_block, roof_block):
    """Build a simple rectangular building shell."""
    x2 = x1 + width
    z2 = z1 + depth
    y_top = y_base + height

    # Floor
    writer.fill(x1, y_base, z1, x2, y_base, z2, floor_block)

    # Walls (hollow)
    writer.fill_hollow(x1, y_base + 1, z1, x2, y_top, z2, wall_block)

    # Clear interior
    if width > 2 and depth > 2 and height > 2:
        writer.fill(x1 + 1, y_base + 1, z1 + 1, x2 - 1, y_top - 1, z2 - 1,
                    BLOCKS["air"])

    # Roof
    writer.fill(x1, y_top, z1, x2, y_top, z2, roof_block)

    return x2, y_top, z2


def peaked_roof(writer, x1, z1, x2, z2, y_base, height, block):
    """Build a peaked (gabled) roof along the X axis."""
    width_z = z2 - z1
    mid_z = (z1 + z2) // 2

    for dy in range(height):
        y = y_base + dy
        shrink = int(dy * (width_z / 2) / height)
        z_lo = z1 + shrink
        z_hi = z2 - shrink
        if z_lo <= z_hi:
            writer.fill(x1, y, z_lo, x2, y, z_hi, block)


def fence_line(writer, x1, z1, x2, z2, y, block="minecraft:oak_fence"):
    """Place a line of fence blocks."""
    if x1 == x2:
        for z in range(min(z1, z2), max(z1, z2) + 1):
            writer.setblock(x1, y, z, block)
    elif z1 == z2:
        for x in range(min(x1, x2), max(x1, x2) + 1):
            writer.setblock(x, y, z1, block)
    else:
        # Diagonal - use Bresenham
        points = bresenham_3d(x1, y, z1, x2, y, z2)
        for px, py, pz in points:
            writer.setblock(px, py, pz, block)


def bresenham_3d(x1, y1, z1, x2, y2, z2):
    """3D Bresenham line algorithm."""
    points = []
    dx = abs(x2 - x1)
    dy = abs(y2 - y1)
    dz = abs(z2 - z1)
    sx = 1 if x2 > x1 else -1
    sy = 1 if y2 > y1 else -1
    sz = 1 if z2 > z1 else -1

    if dx >= dy and dx >= dz:
        ey = 2 * dy - dx
        ez = 2 * dz - dx
        y, z = y1, z1
        for x in range(x1, x2 + sx, sx):
            points.append((x, y, z))
            if ey > 0:
                y += sy
                ey -= 2 * dx
            if ez > 0:
                z += sz
                ez -= 2 * dx
            ey += 2 * dy
            ez += 2 * dz
    elif dy >= dz:
        ex = 2 * dx - dy
        ez = 2 * dz - dy
        x, z = x1, z1
        for y in range(y1, y2 + sy, sy):
            points.append((x, y, z))
            if ex > 0:
                x += sx
                ex -= 2 * dy
            if ez > 0:
                z += sz
                ez -= 2 * dy
            ex += 2 * dx
            ez += 2 * dz
    else:
        ex = 2 * dx - dz
        ey = 2 * dy - dz
        x, y = x1, y1
        for z in range(z1, z2 + sz, sz):
            points.append((x, y, z))
            if ex > 0:
                x += sx
                ex -= 2 * dz
            if ey > 0:
                y += sy
                ey -= 2 * dz
            ex += 2 * dx
            ey += 2 * dy

    return points
