import { assert } from 'chai';

import {
  Observable,
  par,
  makeSubject,
} from '../src/index';

describe('parallel identity', () => {

  const id = function<T>(input: Observable<T>): Observable<T>{
      return input;
  }

  const isNumber = (arg: number | string ): arg is number => {
    return typeof arg === 'number';
  };

  const parId = par<number,string,number,string>(id, id, isNumber);

  it('parId(1,2,3 + "one", "two", "three") = 1,2,3 + "one", "two", "three"', (done: any) => {

    const inputs: Array<[number,string]> = [ [1, 'one'], [2, 'two'], [3, 'three'] ];
    const expectedIntOutputs = [1, 2, 3];
    const expectedStringOutputs = ['one', 'two', 'three'];

    const [subject, stream] = makeSubject<number|string>();
    const output = parId(stream);

    const dispose = output.subscribe({
      onNext: (x: number|string) => {

        if ( isNumber(x) ){
          const expected = expectedIntOutputs.shift();
          assert.equal(x, expected);
        } else {
          const expected = expectedStringOutputs.shift();
          assert.equal(x, expected);
        }

        if (expectedIntOutputs.length===0 && expectedStringOutputs.length===0){
          dispose();
          done();
        }
      }
    });

    inputs.forEach( ([num, text]) => {
      subject.onNext(num);
      subject.onNext(text);
    });

  });
});
