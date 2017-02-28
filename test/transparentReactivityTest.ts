import { assert } from 'chai';

import {
  Observable,
  Enumerable,
  toReactive,
  toInteractive,
  makeSubject,
  unit,
} from '../src/index';

interface User {
  name: String;
  surname: String;
}

describe('transparent reactivity', () => {

  /**
   * programmers write code in an interactive style
   */
  const app = function(input: Enumerable<User>): Enumerable<string>{
    const user = input.getEnumerator();
    if ( user.isReady() ) {
      const currentUser: User = user.current();
      return unit<string>(`Welcome, ${currentUser.name}!`);
    } else {
      return unit<string>('No user found');
    }
  }

  /**
   * the underlying framework wraps users' code in a similar way as Tracker.autorun does in Meteor
   * in this way users' code is rerun automagically every time inputs changes
   */
  const reactApp = toReactive(app);

  it('reactive login', (done: any) => {

    const [subject, input] = makeSubject<User>();
    const output: Observable<string> = reactApp(input);

    const dispose = output.subscribe({
      onNext: (x: string) => {
        assert.equal(x, 'Welcome, John!');
        done();
      }
    });

    subject.onNext({
      name: 'John',
      surname: 'Doe',
    });

  });
});

describe('non reactive', () => {

  const app = function(input: Observable<User>): Observable<string>{
    const [subject, output] = makeSubject<string>();
    input.subscribe({
      onNext: (currentUser) => subject.onNext(`Welcome, ${currentUser.name}!`)
    });
    return output;
  };

  const nonReactApp = toInteractive(app);

  it('non reactive login', (done: any) => {
    const user = unit<User>({
      name: 'John',
      surname: 'Doe',
    });
    const result = nonReactApp(user).getEnumerator();
    // XXX current should return a promise as in Meijer's talk
    setInterval( ()=>{
      assert.equal(result.current(), 'Welcome, John!');
      done();
    }, 500);
  });
});
