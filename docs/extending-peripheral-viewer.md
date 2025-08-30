# Extending MCU Peripheral Viewer

It is possible to extend the MCU Peripheral Viewer with your VSCode extension and provide peripherals information to the MCU Peripheral Viewer without passing an SVD file. In this method, `peripherals` variable passed to the debug launch configuration in `launch.json` file.

```json
{
    ...
    "peripherals": "command:myExtension.command.to.get.peripherals"
    ...
}
```

The `peripherals` variable will define the source to load the peripherals information. Peripherals could be loaded from VSCode command which is defined after `command:` prefix in `peripherals` variable.

## Building your VSCode Extension to extend MCU Peripheral Viewer

This is a guide about how you can inject peripherals information to MCU Peripheral Viewer in your VSCode extension. Please refer to [VSCode Extension API](https://code.visualstudio.com/api) for more information about developing VSCode extensions.

### Adding peripheral-viewer to your VSCode extension

You need to install mcu-debug/peripheral-viewer to access the types information (`PeripheralOptions`, `PeripheralRegisterOptions`, `ClusterOptions`, `FieldOptions`, `AccessType`). You can use `npm` or `yarn` with the following arguments described below:

Using with npm:
```bash
npm install github:mcu-debug/peripheral-viewer
```
Using with yarn:
```bash
yarn add github:mcu-debug/peripheral-viewer
```


### Developing your extension

To provide the peripherals information to MCU Peripheral Viewer on debug session time, you need register your command which is going construct the peripherals information. The command will receive `DebugSession` object as an input parameter and expects to return array of type `PeripheralOptions[]`.

You can find the example command implementation below:

```js
import { commands, DebugSession } from 'vscode';
import { 
	PeripheralOptions, 
	PeripheralRegisterOptions, 
	ClusterOptions, 
	FieldOptions, 
	AccessType 
} from "peripheral-viewer/src/types";
export async function activate(context: ExtensionContext) {
	...
	commands.registerCommand(
		'myExtension.command.to.get.peripherals',
		async (session: DebugSession) => {
			// Load your peripherals data
			const peripherals: PeripheralOptions[] = ...
			return peripherals;
		}
	)
	...
}
```

You can check the type definitions (`PeripheralOptions`, `PeripheralRegisterOptions`, `ClusterOptions`, `FieldOptions`, `AccessType`) from [this document](./appendix-types.md).

### Modifying your package.json

In `package.json` of your VSCode extension project, you need to define the command as an activator and provide the dependency between svd-viewer and your extension. 

You need to add your command to `activationEvents` in the package.json and define MCU Peripheral Viewer in the `extensionDependencies` as shown below:

```json
{
  ...
  "activationEvents": [
    "onCommand:myExtension.command.to.get.peripherals"
  ],
  "extensionDependencies": [
    "mcu-debug.peripheral-viewer"
  ],
  ...
}
```