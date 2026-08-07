export type PizzaVisual = {
  type: "pizza";
  compare: number[];
  shade?: number;
  shades?: number[];
};

export type MoneyVisualItem = {
  emoji: string;
  label: string;
  price: number;
};

export type MoneyVisual = {
  type: "money";
  items: MoneyVisualItem[];
  wallet?: number;
  payment?: number;
  total?: number;
  change?: number;
};

export type LearningVisual = PizzaVisual | MoneyVisual;

