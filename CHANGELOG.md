# Change Log


## [v1.4.0] - 2023-02-17

- First release from a new repo and new extension inherited from https://github.com/cortex-debug/svd-viewer which in turn derived from https://github.com/Marus/cortex-debug. Yes, version number was bumped so Rob can still make any updates to his extension during the transition period
- Note that we are still in `Preview` mode
- Big thanks to [Rob Moran](https://github.com/cortex-debug/svd-viewer/commits?author=thegecko). He did many things to help the community (especially me)
  - Made the SVD viewer browser friendly, and taught me how to do it
  - Refactored a lot of the code from Cortex-Debug and modified it to be browser friendly
  - Added support for CMSIS packs
- Several changes, improvements and fixes have been made
  - We now cache SVD info for faster restarts
  - Several fixes that were pending on the Cortex-Debug repo
- Note that cortex-debug itself will soon no longer do its own SVD/Peripheral support. We hope you use this extension (or others)
- It is still compatible with Desktop and Browser usage

# Prior History

## [v1.2.1] - 2023-XX-XX
- Never released publicly

### New Features

- Add support for using the [debug tracker extension](https://github.com/mcu-debug/debug-tracker-vscode) if installed by the user ([Rob Moran](https://github.com/thegecko))

### Changes

- Transferred publisher and source to [mcu-debug/peripheral-viewer](https://github.com/mcu-debug/svd-viewer) ([Haneef Mohammed](https://github.com/haneefdm))

## [v1.1.1] - 2023-01-30

### New Features

- Refresh codebase on [cortex-debug#56c03f](https://github.com/Marus/cortex-debug/commit/056c03f01e008828e6527c571ef5c9adaf64083f) (2023-01-23)
- Add support for loading SVD files from CMSIS pack asset API ([Rob Moran](https://github.com/thegecko))

## [v1.0.4] - 2022-09-05

### New Features

- Initial standalone release ([Rob Moran](https://github.com/thegecko))
- Browser support ([Rob Moran](https://github.com/thegecko))
- Support any debug adapter (using `readMemory` and `writeMemory` DAP commands) ([Rob Moran](https://github.com/thegecko))
