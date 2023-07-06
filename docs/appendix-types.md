# Appendix: Types of `peripheral-viewer` 

Types could be imported from `peripheral-viewer` like the code below:

```js
import { 
	AccessType,
	PeripheralOptions, 
	PeripheralRegisterOptions, 
	ClusterOptions, 
	FieldOptions
} from "peripheral-viewer/src/types";
```

## Enum: AccessType

AccessType enum defines the type of the access to the related peripheral item. 

```js
enum AccessType {
    ReadOnly = 1,
    ReadWrite,
    WriteOnly
}
```

## Interface: PeripheralOptions 

The definition of the PeripheralOptions interface is shown below: 

```js
interface PeripheralOptions {
    name: string;
    baseAddress: number;
    totalLength: number;
    description: string;
    groupName?: string;
    accessType?: AccessType;
    size?: number;
    resetValue?: number;
    registers?: PeripheralRegisterOptions[];
    clusters?: ClusterOptions[];
}
```
## Interface: PeripheralRegisterOptions

The definition of the PeripheralRegisterOptions interface is shown below: 

```js
interface PeripheralRegisterOptions {
    name: string;
    description?: string;
    addressOffset: number;
    accessType?: AccessType;
    size?: number;
    resetValue?: number;
    fields?: FieldOptions[];
}
```

## Interface: ClusterOptions Interface

The definition of the ClusterOptions interface is shown below: 

```js
interface ClusterOptions {
    name: string;
    description?: string;
    addressOffset: number;
    accessType?: AccessType;
    size?: number;
    resetValue?: number;
    registers?: PeripheralRegisterOptions[];
    clusters?: ClusterOptions[];
}
```

## Interface: FieldOptions Interface

The definition of the FieldOptions interface is shown below: 

```js
interface FieldOptions {
    name: string;
    description: string;
    offset: number;
    width: number;
    enumeration?: EnumerationMap;
    accessType?: AccessType;
}
```
