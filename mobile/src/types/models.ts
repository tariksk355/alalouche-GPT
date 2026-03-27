export type SelectedOption = {
  groupId?: string;
  optionId?: string;
  groupName: string;
  optionLabel: string;
  priceDelta?: number;
};

export type MenuOption = {
  id: string;
  label: string;
  priceDelta: number;
  isDefault?: boolean;
};

export type MenuOptionGroup = {
  id: string;
  name: string;
  selectionType: 'single' | 'multiple';
  required: boolean;
  minSelections?: number | null;
  maxSelections?: number | null;
  options: MenuOption[];
};

export type MenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  category: string;
  imageUrl?: string | null;
  optionGroups?: MenuOptionGroup[];
};

export type CartLine = {
  lineKey: string;
  id: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions: SelectedOption[];
};
