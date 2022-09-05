# Cortex Debug SVD Viewer

Standalone SVD Viewer extension extracted from [cortex-debug](https://github.com/Marus/cortex-debug)

## Specifying SVD Files

The Cortex-Debug Extension uses [System View Description](http://www.keil.com/pack/doc/CMSIS/SVD/html/index.html) (SVD) files to display information about the selected part, including the Cortex Peripherals view.

To specifying an SVD file, obtain the SVD file from a [CMSIS pack](https://developer.arm.com/tools-and-software/embedded/cmsis/cmsis-packs) or from your device manufacturer.
For instance, for ST use instructions at [this link](https://community.st.com/s/question/0D50X00009XkWDkSAN/how-does-st-manage-svd-files).
Other vendors may ship SVD files when you install their SW or device pack.


Once you have the SVD file, specify the location of the file in your `launch.json` using something like `"svdFile": "./STM32F103.svd"`.

You can modify the `SVD Viewer: Svd Path Config` extension setting to specify a different key to use in the `launch.json` for the SVD path.
