"""Chunked mcfunction file writer with automatic splitting."""

import math


class McFunctionWriter:
    """Writes Minecraft Bedrock mcfunction commands with automatic file chunking."""

    def __init__(self, base_name, max_commands=8000):
        self.base_name = base_name  # e.g. "kings_island/rides/beast_track"
        self.max_commands = max_commands
        self.chunks = []  # List of lists of command strings
        self.current_chunk = []
        self.chunks.append(self.current_chunk)
        self.total_commands = 0

    def _check_chunk(self):
        if len(self.current_chunk) >= self.max_commands:
            self.current_chunk = []
            self.chunks.append(self.current_chunk)

    def add(self, command):
        """Add a single command."""
        self._check_chunk()
        self.current_chunk.append(command)
        self.total_commands += 1

    def comment(self, text):
        """Add a comment line."""
        self.add(f"## {text}")

    def setblock(self, x, y, z, block, data=0):
        """Place a single block."""
        x, y, z = int(x), int(y), int(z)
        if data:
            self.add(f"setblock {x} {y} {z} {block} {data}")
        else:
            self.add(f"setblock {x} {y} {z} {block}")

    def fill(self, x1, y1, z1, x2, y2, z2, block, mode=""):
        """Fill a region, auto-splitting if volume exceeds limit."""
        x1, y1, z1 = int(x1), int(y1), int(z1)
        x2, y2, z2 = int(x2), int(y2), int(z2)

        # Ensure x1<=x2, y1<=y2, z1<=z2
        x1, x2 = min(x1, x2), max(x1, x2)
        y1, y2 = min(y1, y2), max(y1, y2)
        z1, z2 = min(z1, z2), max(z1, z2)

        dx = x2 - x1 + 1
        dy = y2 - y1 + 1
        dz = z2 - z1 + 1
        volume = dx * dy * dz

        if volume <= 32768:
            mode_str = f" {mode}" if mode else ""
            self.add(f"fill {x1} {y1} {z1} {x2} {y2} {z2} {block}{mode_str}")
        else:
            # Split along the longest axis
            if dx >= dy and dx >= dz:
                mid = x1 + dx // 2
                self.fill(x1, y1, z1, mid, y2, z2, block, mode)
                self.fill(mid + 1, y1, z1, x2, y2, z2, block, mode)
            elif dy >= dz:
                mid = y1 + dy // 2
                self.fill(x1, y1, z1, x2, mid, z2, block, mode)
                self.fill(x1, mid + 1, z1, x2, y2, z2, block, mode)
            else:
                mid = z1 + dz // 2
                self.fill(x1, y1, z1, x2, y2, mid, block, mode)
                self.fill(x1, y1, mid + 1, x2, y2, z2, block, mode)

    def fill_hollow(self, x1, y1, z1, x2, y2, z2, block):
        """Fill a hollow box (walls only)."""
        self.fill(x1, y1, z1, x2, y2, z2, block, "hollow")

    def fill_replace(self, x1, y1, z1, x2, y2, z2, block, replace_block):
        """Fill replacing only specific blocks."""
        x1, y1, z1 = int(x1), int(y1), int(z1)
        x2, y2, z2 = int(x2), int(y2), int(z2)
        self.add(f"fill {x1} {y1} {z1} {x2} {y2} {z2} {block} replace {replace_block}")

    def playsound(self, sound, x, y, z, volume=1.0, pitch=1.0, radius=20):
        """Play a sound at a location."""
        self.add(f"playsound {sound} @a[x={x},y={y},z={z},r={radius}] {x} {y} {z} {volume} {pitch}")

    def particle(self, particle_name, x, y, z):
        """Spawn particles."""
        self.add(f"particle {particle_name} {x} {y} {z}")

    def summon(self, entity, x, y, z, extra=""):
        """Summon an entity."""
        extra_str = f" {extra}" if extra else ""
        self.add(f"summon {entity} {x} {y} {z}{extra_str}")

    def tp(self, target, x, y, z):
        """Teleport."""
        self.add(f"tp {target} {x} {y} {z}")

    def title(self, target, text, title_type="title"):
        """Display title text."""
        self.add(f'title {target} {title_type} {{"rawtext":[{{"text":"{text}"}}]}}')

    def get_file_map(self):
        """Return dict of filename -> command list for all chunks."""
        files = {}
        if len(self.chunks) == 1:
            files[f"{self.base_name}.mcfunction"] = self.chunks[0]
        else:
            for i, chunk in enumerate(self.chunks):
                if chunk:  # Skip empty chunks
                    suffix = f"_{i+1:02d}"
                    files[f"{self.base_name}{suffix}.mcfunction"] = chunk
        return files

    def get_function_calls(self):
        """Return list of /function commands to call all chunks."""
        calls = []
        if len(self.chunks) == 1:
            calls.append(f"function {self.base_name}")
        else:
            for i, chunk in enumerate(self.chunks):
                if chunk:
                    suffix = f"_{i+1:02d}"
                    calls.append(f"function {self.base_name}{suffix}")
        return calls
