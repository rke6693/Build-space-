# Colonial House Builder - Minecraft Bedrock Edition Addon

A professional Minecraft Bedrock Edition behavior pack that builds an exact replica of a 2-story colonial house with attached 2-car garage. Designed for iPad (and all Bedrock Edition platforms).

## House Features

- **2-Story Colonial Design** with cream lap siding and brown board-and-batten gable accent
- **Attached 2-Car Garage** with sectional door
- **Covered Front Porch** with white columns and lanterns
- **Rear Wooden Deck** with stairs and railing
- **Full Interior** including:
  - Open-concept living room and kitchen (1st floor)
  - Central staircase connecting both floors
  - 3 bedrooms and bathroom (2nd floor)
  - Garage with interior door to house
- **Dark Shingle Gable Roof** with cross-gable detail
- **Concrete Driveway** with realistic control joints
- **Landscaping** with bushes, trees, and flower beds
- **Neighborhood Details** including partial neighbor houses and power line tower

## Block Palette

| Feature | Block |
|---------|-------|
| Cream siding | Smooth Sandstone |
| Brown gable | Spruce Planks |
| Roof shingles | Dark Oak Stairs/Slabs |
| White trim | Quartz Block |
| Windows | Glass Pane |
| Front door | Dark Oak Door |
| Porch columns | Quartz Pillar |
| Foundation | Stone Bricks |
| Driveway | Light Gray Concrete |
| Deck | Oak Planks |
| Interior walls | White Concrete |
| Interior floors | Oak Planks |

## Installation on iPad

### Method 1: Direct File Transfer
1. Download/clone this repository
2. Rename `house_builder_BP` folder to `house_builder_BP.mcpack` (or zip it and rename to `.mcpack`)
3. Transfer the `.mcpack` file to your iPad via AirDrop, email, or Files app
4. Tap the `.mcpack` file — Minecraft will open and import it automatically

### Method 2: Manual Installation
1. Connect iPad to a computer
2. Navigate to: `Minecraft/games/com.mojang/behavior_packs/`
3. Copy the entire `house_builder_BP` folder there
4. Restart Minecraft

### Method 3: Using Files App
1. Open the Files app on iPad
2. Navigate to: `On My iPad > Minecraft > games > com.mojang > behavior_packs`
3. Copy the `house_builder_BP` folder there

## How to Use

1. Open Minecraft Bedrock Edition
2. Create a new world or edit an existing one
3. Go to **Behavior Packs** and activate **"Colonial House Builder"**
4. Make sure **cheats are enabled** (required for /function commands)
5. Enter the world and stand on flat ground
6. Open chat and type: `/function build`
7. The house will generate in front of you!

### Individual Build Commands

You can also build sections individually:

| Command | Description |
|---------|-------------|
| `/function build` | Build the complete house |
| `/function clear` | Clear the build area |
| `/function foundation` | Foundation only |
| `/function first_floor` | First floor walls |
| `/function second_floor` | Second floor walls |
| `/function garage` | Garage structure |
| `/function roof` | All roof sections |
| `/function porch` | Front porch |
| `/function deck` | Back deck |
| `/function windows` | All windows |
| `/function doors` | All doors |
| `/function interior` | Interior rooms and stairs |
| `/function driveway` | Driveway and walkway |
| `/function details` | Landscaping and finishing touches |

## Tips

- Build on **flat terrain** (Superflat world recommended) for best results
- The house is approximately **30 blocks wide x 27 blocks deep x 16 blocks tall**
- Use `/function clear` to reset the area if needed
- The house builds in the **+X and +Z direction** from where you stand

## Compatibility

- Minecraft Bedrock Edition 1.21+
- iPad, iPhone, Android, Windows 10/11, Xbox, PlayStation, Nintendo Switch
- Requires cheats/commands enabled

## File Structure

```
house_builder_BP/
├── manifest.json          # Pack metadata
└── functions/
    ├── build.mcfunction       # Main build (calls all others)
    ├── clear.mcfunction       # Clear build area
    ├── foundation.mcfunction  # Stone foundation
    ├── first_floor.mcfunction # First floor walls
    ├── second_floor.mcfunction# Second floor walls
    ├── garage.mcfunction      # 2-car garage
    ├── roof.mcfunction        # Gable roof system
    ├── porch.mcfunction       # Covered front porch
    ├── deck.mcfunction        # Rear wooden deck
    ├── windows.mcfunction     # All windows
    ├── doors.mcfunction       # All doors
    ├── interior.mcfunction    # Interior rooms/stairs
    ├── driveway.mcfunction    # Driveway/walkway
    └── details.mcfunction     # Landscaping/details
```
