import { assert } from 'chai';

import {
  Observable,
  seq,
  makeSubject,
} from '../src/index';

describe('sequential adder', () => {

  const adder = function(input: Observable<number>): Observable<number>{
      const [ subject, output ] = makeSubject<number>();
      input.subscribe({
        onNext: (x: number) => subject.onNext(x+1)
      })
      return output;
  }

  const plusTwo = seq(adder, adder);

  it('adder(adder(1,2,3))=2,3,4', (done: any) => {

    const inputs = [1, 2, 3];
    const expectedOutputs = [3, 4, 5];

    const [subject, stream] = makeSubject<number>();

    const output = plusTwo(stream);

    const dispose = output.subscribe({
      onNext: (x: number) => {
        const expected = expectedOutputs.shift();
        assert.equal(x, expected);

        if (expectedOutputs.length===0){
          dispose();
          done();
        }
      }
    });

    inputs.forEach( num => subject.onNext(num) );

  });
});
