"""Assembles behavior pack files and packages as .mcpack."""

import json
import os
import zipfile
import struct
import zlib
from kings_island.config import (
    PACK_NAME, PACK_DESCRIPTION, PACK_VERSION,
    MIN_ENGINE_VERSION, HEADER_UUID, MODULE_UUID
)


# Minimal 16x16 PNG icon (orange/gold crown on blue background)
def _generate_pack_icon():
    """Generate a minimal valid PNG for the pack icon."""
    width, height = 16, 16

    # Create pixel data - simple crown icon
    pixels = []
    for y in range(height):
        row = []
        for x in range(width):
            # Blue background
            r, g, b = 30, 80, 160

            # Gold crown shape
            if 4 <= y <= 12 and 2 <= x <= 13:
                if y >= 8:  # Crown base
                    r, g, b = 218, 165, 32
                elif y >= 4:  # Crown points
                    if x in (2, 3, 7, 8, 12, 13) and y <= 6:
                        r, g, b = 218, 165, 32
                    elif y >= 6:
                        r, g, b = 218, 165, 32

            # Red jewels
            if y == 9 and x in (5, 8, 11):
                r, g, b = 200, 30, 30

            row.append((r, g, b))
        pixels.append(row)

    # Encode as PNG
    def make_png(w, h, pixels):
        def chunk(chunk_type, data):
            c = chunk_type + data
            crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
            return struct.pack('>I', len(data)) + c + crc

        header = b'\x89PNG\r\n\x1a\n'

        ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
        ihdr = chunk(b'IHDR', ihdr_data)

        raw = b''
        for row in pixels:
            raw += b'\x00'  # Filter: None
            for r, g, b in row:
                raw += struct.pack('BBB', r, g, b)

        compressed = zlib.compress(raw)
        idat = chunk(b'IDAT', compressed)
        iend = chunk(b'IEND', b'')

        return header + ihdr + idat + iend

    return make_png(width, height, pixels)


class PackBuilder:
    """Builds and packages a Minecraft Bedrock behavior pack."""

    def __init__(self, pack_dir_name, output_path):
        self.pack_dir_name = pack_dir_name
        self.output_path = output_path
        self.files = {}  # path_in_zip -> content (str or bytes)
        self.function_registry = []  # List of (namespace/path, writer) tuples
        self.total_commands = 0
        self.total_files = 0

    def _create_manifest(self):
        """Create the behavior pack manifest."""
        return json.dumps({
            "format_version": 2,
            "header": {
                "name": PACK_NAME,
                "description": PACK_DESCRIPTION,
                "uuid": HEADER_UUID,
                "version": PACK_VERSION,
                "min_engine_version": MIN_ENGINE_VERSION
            },
            "modules": [
                {
                    "type": "data",
                    "uuid": MODULE_UUID,
                    "version": PACK_VERSION
                }
            ]
        }, indent=2)

    def register_writer(self, writer):
        """Register an McFunctionWriter to be included in the pack."""
        self.function_registry.append(writer)

    def add_raw_function(self, path, commands):
        """Add a raw mcfunction file (list of command strings)."""
        func_path = f"functions/{path}.mcfunction"
        self.files[func_path] = "\n".join(commands) + "\n"

    def write_master_function(self):
        """Create the build_all.mcfunction that calls everything."""
        master_commands = [
            "## Kings Island Theme Park - Master Build Script",
            '## Run: /function kings_island/build_all',
            '## WARNING: This will place ~200,000 blocks. Build in a flat world.',
            '',
            'say §6§l[Kings Island] §r§eBuild starting... This may take a moment!',
            '',
        ]

        # Collect all function calls from registered writers
        all_calls = []
        for writer in self.function_registry:
            calls = writer.get_function_calls()
            all_calls.extend(calls)

        # Group by category for organized output
        categories = {}
        for call in all_calls:
            parts = call.replace("function ", "").split("/")
            if len(parts) >= 3:
                cat = parts[1]  # e.g., "terrain", "structures", "rides"
            else:
                cat = "other"
            categories.setdefault(cat, []).append(call)

        for cat, calls in sorted(categories.items()):
            master_commands.append(f"## === {cat.upper()} ===")
            master_commands.extend(calls)
            master_commands.append("")

        master_commands.append('say §6§l[Kings Island] §r§aBuild complete! Welcome to Kings Island!')
        master_commands.append('say §7Use minecarts at ride stations to ride the coasters!')
        master_commands.append('say §7Explore: International Street, Coney Mall, Rivertown, Action Zone, Area 72, Planet Snoopy')

        self.add_raw_function("kings_island/build_all", master_commands)

        # Also create individual area builders for performance
        for cat, calls in sorted(categories.items()):
            area_commands = [
                f"## Kings Island - Build {cat.title()}",
                f'say §6§l[Kings Island] §r§eBuilding {cat}...',
                '',
            ]
            area_commands.extend(calls)
            area_commands.append(f'say §6§l[Kings Island] §r§a{cat.title()} complete!')
            self.add_raw_function(f"kings_island/build_{cat}", area_commands)

    def package(self):
        """Package everything into a .mcpack zip file."""
        # Add manifest
        self.files["manifest.json"] = self._create_manifest()

        # Add icon
        self.files["pack_icon.png"] = _generate_pack_icon()

        # Process all registered writers
        for writer in self.function_registry:
            file_map = writer.get_file_map()
            for path, commands in file_map.items():
                func_path = f"functions/{path}"
                content = "\n".join(commands) + "\n"
                self.files[func_path] = content
                self.total_commands += len(commands)
                self.total_files += 1

        # Count raw function files too
        for path, content in self.files.items():
            if path.startswith("functions/") and path not in [f"functions/{w.base_name}" for w in self.function_registry]:
                if isinstance(content, str):
                    self.total_commands += content.count("\n")

        # Write zip
        with zipfile.ZipFile(self.output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for path, content in sorted(self.files.items()):
                if isinstance(content, bytes):
                    zf.writestr(path, content)
                else:
                    zf.writestr(path, content)

        return self.output_path
