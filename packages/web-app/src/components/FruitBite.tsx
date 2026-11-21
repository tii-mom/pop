interface FruitBiteProps {
  before: string;
  after: string;
  tierId: number;
  label: string;
}

// A slice of the original artwork lifts away while the claimed state appears underneath.
export function FruitBite({ before, after, tierId, label }: FruitBiteProps) {
  return (
    <div className={`fruit-bite fruit-bite-${tierId}`} role="img" aria-label={label}>
      <img src={after} alt="" className="bite-result" />
      <img src={before} alt="" className="bite-before" />
      <img src={before} alt="" className="bite-piece" />
    </div>
  );
}
