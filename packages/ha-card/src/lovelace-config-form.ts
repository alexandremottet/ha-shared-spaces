/**
 * Shape HA's card editor dialog expects from a card's `getConfigForm()`.
 */
export interface LovelaceConfigFormSchema {
  name: string;
  required?: boolean;
  selector: Record<string, unknown>;
}

export interface LovelaceConfigForm {
  schema: LovelaceConfigFormSchema[];
}
