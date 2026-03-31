"""Coaster track builder - converts control points to rideable minecart rail systems."""

import math
from kings_island.mcfunction_writer import McFunctionWriter
from kings_island.geometry import catmull_rom_spline, discretize_path, bresenham_3d
from kings_island.config import BLOCKS


class CoasterBuilder:
    """Builds a rideable minecart roller coaster from control points."""

    def __init__(self, writer, name, style="wood"):
        self.writer = writer
        self.name = name
        self.style = style  # "wood" or "steel"

        if style == "wood":
            self.support_block = BLOCKS["oak_log"]
            self.track_base = BLOCKS["oak_planks"]
            self.fence_block = BLOCKS["wood_coaster"]
            self.support_cross = BLOCKS["oak_planks"]
        else:
            self.support_block = BLOCKS["iron"]
            self.track_base = BLOCKS["light_gray_concrete"]
            self.fence_block = BLOCKS["steel_support"]
            self.support_cross = BLOCKS["iron_bars"]

    def build_track(self, control_points, ground_y=64, chain_lift_segments=None,
                    brake_segments=None, spline_resolution=8):
        """Build a complete coaster track from control points.

        Args:
            control_points: List of (x, y, z) tuples defining the coaster path
            ground_y: Ground level Y coordinate
            chain_lift_segments: Set of segment indices that are chain lifts (powered rail every block)
            brake_segments: Set of segment indices that are brake runs
            spline_resolution: Points per control point segment for smoothing
        """
        if chain_lift_segments is None:
            chain_lift_segments = set()
        if brake_segments is None:
            brake_segments = set()

        self.writer.comment(f"=== {self.name} Coaster Track ===")

        # Interpolate smooth path
        float_path = catmull_rom_spline(control_points, num_segments=spline_resolution)
        track_points = discretize_path(float_path)

        if not track_points:
            return

        # Determine which segments need chain lift / brakes
        chain_points = set()
        brake_points = set()

        points_per_segment = spline_resolution
        for seg_idx in chain_lift_segments:
            start = seg_idx * points_per_segment
            end = start + points_per_segment
            for i in range(start, min(end, len(track_points))):
                chain_points.add(i)

        for seg_idx in brake_segments:
            start = seg_idx * points_per_segment
            end = start + points_per_segment
            for i in range(start, min(end, len(track_points))):
                brake_points.add(i)

        # Place track
        for i, (x, y, z) in enumerate(track_points):
            # Track base block
            self.writer.setblock(x, y - 1, z, self.track_base)

            # Rail type
            if i in chain_points:
                # Chain lift: powered rail on redstone block
                self.writer.setblock(x, y - 2, z, BLOCKS["redstone_block"])
                self.writer.setblock(x, y, z, BLOCKS["powered_rail"])
            elif i in brake_points:
                # Brake run: unpowered powered rail (slows down)
                self.writer.setblock(x, y, z, BLOCKS["powered_rail"])
            elif i % 25 == 0:
                # Regular powered boost every 25 blocks
                self.writer.setblock(x, y - 2, z, BLOCKS["redstone_block"])
                self.writer.setblock(x, y, z, BLOCKS["powered_rail"])
            else:
                self.writer.setblock(x, y, z, BLOCKS["rail"])

            # Support structure down to ground
            if i % 3 == 0:
                self._place_support(x, y, z, ground_y)

        # Place fencing/railings along track
        self._place_railings(track_points)

        return track_points

    def build_station(self, x, y, z, length=20, width=8, direction="z"):
        """Build a ride station with loading platform."""
        self.writer.comment(f"=== {self.name} Station ===")

        half_w = width // 2

        if direction == "z":
            # Station building
            x1, z1 = x - half_w, z
            x2, z2 = x + half_w, z + length

            # Floor
            self.writer.fill(x1, y, z1, x2, y, z2, BLOCKS["path_main"])

            # Walls
            self.writer.fill(x1, y + 1, z1, x1, y + 5, z2, self.track_base)
            self.writer.fill(x2, y + 1, z1, x2, y + 5, z2, self.track_base)

            # Roof
            self.writer.fill(x1, y + 6, z1, x2, y + 6, z2, self.track_base)

            # Loading platform (raised by 1)
            self.writer.fill(x - 2, y + 1, z1 + 2, x - 1, y + 1, z2 - 2, BLOCKS["path_accent"])
            self.writer.fill(x + 1, y + 1, z1 + 2, x + 2, y + 1, z2 - 2, BLOCKS["path_accent"])

            # Rail through station
            for dz in range(length):
                sz = z + dz
                self.writer.setblock(x, y, sz, BLOCKS["redstone_block"])
                self.writer.setblock(x, y + 1, sz, BLOCKS["powered_rail"])

            # Minecart spawner button (detector rail at start)
            self.writer.setblock(x, y + 1, z + 1, BLOCKS["detector_rail"])

            # Lights
            for dz in range(0, length, 4):
                self.writer.setblock(x, y + 5, z + dz, BLOCKS["glowstone"])

            # Sign area (gold block marker)
            self.writer.setblock(x, y + 4, z, BLOCKS["yellow_concrete"])

            # Place a minecart
            self.writer.summon("minecart", x, y + 2, z + 2)

        else:  # direction == "x"
            z1, x1 = z - half_w, x
            z2, x2 = z + half_w, x + length

            self.writer.fill(x1, y, z1, x2, y, z2, BLOCKS["path_main"])
            self.writer.fill(x1, y + 1, z1, x2, y + 5, z1, self.track_base)
            self.writer.fill(x1, y + 1, z2, x2, y + 5, z2, self.track_base)
            self.writer.fill(x1, y + 6, z1, x2, y + 6, z2, self.track_base)

            for dx in range(length):
                sx = x + dx
                self.writer.setblock(sx, y, z, BLOCKS["redstone_block"])
                self.writer.setblock(sx, y + 1, z, BLOCKS["powered_rail"])

            self.writer.setblock(x + 1, y + 1, z, BLOCKS["detector_rail"])
            self.writer.summon("minecart", x + 2, y + 2, z)

    def _place_support(self, x, y, z, ground_y):
        """Place a support column from track down to ground."""
        if y - 2 > ground_y:
            # Vertical support
            self.writer.fill(x, ground_y, z, x, y - 2, z, self.support_block)

            # Cross bracing every 10 blocks of height
            support_height = y - 2 - ground_y
            if support_height > 10:
                for brace_y in range(ground_y + 5, y - 2, 10):
                    # Small cross brace
                    self.writer.setblock(x - 1, brace_y, z, self.support_cross)
                    self.writer.setblock(x + 1, brace_y, z, self.support_cross)
                    self.writer.setblock(x, brace_y, z - 1, self.support_cross)
                    self.writer.setblock(x, brace_y, z + 1, self.support_cross)

    def _place_railings(self, track_points):
        """Place fence railings along both sides of the track."""
        for i, (x, y, z) in enumerate(track_points):
            if i % 2 == 0:  # Every other block for performance
                # Determine track direction for railing offset
                if i < len(track_points) - 1:
                    nx, ny, nz = track_points[i + 1]
                    dx = nx - x
                    dz = nz - z
                    # Place railings perpendicular to track direction
                    if abs(dx) > abs(dz):
                        self.writer.setblock(x, y, z - 1, self.fence_block)
                        self.writer.setblock(x, y, z + 1, self.fence_block)
                    else:
                        self.writer.setblock(x - 1, y, z, self.fence_block)
                        self.writer.setblock(x + 1, y, z, self.fence_block)


class FlatRideBuilder:
    """Builds static/decorative flat rides."""

    def __init__(self, writer):
        self.writer = writer

    def drop_tower(self, cx, y_base, cz, height=150):
        """Build a drop tower (like Drop Tower: Scream Zone)."""
        self.writer.comment("=== Drop Tower ===")

        # Central tower shaft
        from kings_island.geometry import cylinder
        cylinder(self.writer, cx, y_base, cz, 3, height, BLOCKS["gray_concrete"], filled=False)

        # Internal structure
        self.writer.fill(cx - 1, y_base, cz - 1, cx + 1, y_base + height, cz + 1, BLOCKS["iron"])

        # Gondola ring at various heights (static positions)
        for ring_y in [y_base + 10, y_base + height - 20]:
            for dx in range(-4, 5):
                for dz in range(-4, 5):
                    dist = math.sqrt(dx * dx + dz * dz)
                    if 3 <= dist <= 4:
                        self.writer.setblock(cx + dx, ring_y, cz + dz, BLOCKS["red_concrete"])
                        self.writer.setblock(cx + dx, ring_y - 1, cz + dz, BLOCKS["iron_bars"])

        # Top cap
        self.writer.fill(cx - 4, y_base + height, cz - 4,
                        cx + 4, y_base + height + 2, cz + 4, BLOCKS["gray_concrete"])

        # Lights at top
        for dx in [-3, 0, 3]:
            for dz in [-3, 0, 3]:
                self.writer.setblock(cx + dx, y_base + height + 3, cz + dz, BLOCKS["redstone_lamp"])

        # Base platform
        self.writer.fill(cx - 6, y_base, cz - 6, cx + 6, y_base, cz + 6, BLOCKS["path_main"])

    def windseeker(self, cx, y_base, cz, height=100):
        """Build a WindSeeker-style swing tower."""
        self.writer.comment("=== WindSeeker ===")

        # Central pole
        self.writer.fill(cx, y_base, cz, cx, y_base + height, cz, BLOCKS["iron"])

        # Top disc
        from kings_island.geometry import cylinder_fill
        cylinder_fill(self.writer, cx, y_base + height, cz, 8, 2, BLOCKS["white_concrete"])

        # Swing chains (static, radiating outward)
        swing_y = y_base + height - 5
        for angle_deg in range(0, 360, 15):
            angle = math.radians(angle_deg)
            sx = cx + int(10 * math.cos(angle))
            sz = cz + int(10 * math.sin(angle))
            # Chain
            self.writer.setblock(sx, swing_y, sz, BLOCKS["iron_bars"])
            self.writer.setblock(sx, swing_y - 1, sz, BLOCKS["iron_bars"])
            # Seat
            self.writer.setblock(sx, swing_y - 2, sz, BLOCKS["orange_concrete"])

        # Base platform
        cylinder_fill(self.writer, cx, y_base, cz, 8, 1, BLOCKS["path_main"])

    def delirium(self, cx, y_base, cz):
        """Build a Delirium-style giant frisbee ride."""
        self.writer.comment("=== Delirium ===")

        # Two tall A-frame supports
        for side in [-1, 1]:
            sx = cx + side * 12
            # A-frame legs
            self.writer.fill(sx - 2, y_base, cz - 1, sx - 2, y_base + 40, cz - 1, BLOCKS["iron"])
            self.writer.fill(sx + 2, y_base, cz - 1, sx + 2, y_base + 40, cz - 1, BLOCKS["iron"])
            self.writer.fill(sx - 2, y_base, cz + 1, sx - 2, y_base + 40, cz + 1, BLOCKS["iron"])
            self.writer.fill(sx + 2, y_base, cz + 1, sx + 2, y_base + 40, cz + 1, BLOCKS["iron"])
            # Top connecting beam
            self.writer.fill(sx - 2, y_base + 40, cz - 1, sx + 2, y_base + 40, cz + 1, BLOCKS["iron"])

        # Cross beam connecting the two supports
        self.writer.fill(cx - 12, y_base + 40, cz, cx + 12, y_base + 40, cz, BLOCKS["iron"])

        # Gondola disc (static, at rest position)
        from kings_island.geometry import cylinder_fill
        cylinder_fill(self.writer, cx, y_base + 5, cz, 6, 2, BLOCKS["yellow_concrete"])

        # Arm connecting gondola to pivot
        self.writer.fill(cx, y_base + 6, cz, cx, y_base + 40, cz, BLOCKS["iron"])

        # Platform
        cylinder_fill(self.writer, cx, y_base, cz, 15, 1, BLOCKS["path_main"])

    def carousel(self, cx, y_base, cz, radius=8):
        """Build a carousel/merry-go-round."""
        self.writer.comment("=== Carousel ===")

        from kings_island.geometry import cylinder_fill, cylinder

        # Platform
        cylinder_fill(self.writer, cx, y_base, cz, radius, 1, BLOCKS["plaza_white"])

        # Center pole
        self.writer.fill(cx, y_base + 1, cz, cx, y_base + 8, cz, BLOCKS["iron"])

        # Roof (cone-like)
        for dy in range(4):
            r = radius - dy
            if r > 0:
                cylinder(self.writer, cx, y_base + 8 + dy, cz, r, 1, BLOCKS["roof_red"], filled=False)

        # Horses (colored wool at intervals)
        colors = [BLOCKS["wool_white"], BLOCKS["yellow_concrete"], BLOCKS["pink_concrete"],
                  BLOCKS["cyan_concrete"]]
        for i, angle_deg in enumerate(range(0, 360, 30)):
            angle = math.radians(angle_deg)
            hx = cx + int((radius - 2) * math.cos(angle))
            hz = cz + int((radius - 2) * math.sin(angle))
            color = colors[i % len(colors)]
            self.writer.setblock(hx, y_base + 1, hz, BLOCKS["iron_bars"])
            self.writer.setblock(hx, y_base + 2, hz, color)
            self.writer.setblock(hx, y_base + 3, hz, BLOCKS["iron_bars"])

        # Lights around edge
        for angle_deg in range(0, 360, 45):
            angle = math.radians(angle_deg)
            lx = cx + int(radius * math.cos(angle))
            lz = cz + int(radius * math.sin(angle))
            self.writer.setblock(lx, y_base + 7, lz, BLOCKS["glowstone"])
