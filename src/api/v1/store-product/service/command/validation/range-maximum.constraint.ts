import { ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'rangeMaximum', async: false })
export class RangeMaximumConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const minimum = (args.object as Record<string, unknown>)[args.constraints[0]];
    return (
      value === undefined ||
      minimum === undefined ||
      (typeof value === 'number' && typeof minimum === 'number' && value >= minimum)
    );
  }
  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be greater than or equal to ${args.constraints[0]}`;
  }
}
