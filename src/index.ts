/**
 *
 * Code based on https://gist.github.com/ivarru/1138462) and Meijer's talks
 */

export type Disposable = () => void;

export interface Observer<T> {
  onCompleted?(): void;
  onError?(error: Error): void;
  onNext(value: T): void;
}

export interface Observable<T> {
  subscribe(observer: Observer<T>): Disposable;
}

export interface Enumerable<T> {
  getEnumerator(): Enumerator<T>;
}

export interface Enumerator<T> {
  isReady(): boolean;
  moveNext(): void;
  current(): T;
}

export interface Fun<T, U> {
    (x: T): U;
}

// Following Rummelhoff we use a queue as a shared data structure between Observer and Enumerator
// This implementation is rather inefficient and unsafe, but at the moment I do not care
class Queue<T> {
  private queue = new Array<T>();
  isEmpty(): boolean {
    return this.queue.length === 0;
  }
  peep(): T {
    return this.queue[0];
  }
  enqueue(x: T): void {
    this.queue.push(x);
  }
  dequeue(): T {
    return <T>this.queue.shift();
  }
}

/**
 *
 * Produce a pair of consumer and producer linked by a common resource.
 *
 * aka unit morphism
 */
function producePair<T>(): [ Observer<T>, Enumerator<T> ] {
  // in the future I want to replace it with a sort of stream builder
  // independent from the underlying stream library as CycleJS does
  const queue = new Queue<T>();
  // observer is a setter/consumer (T) => ()
  const observer = {
    onNext: (x: T) => queue.enqueue(x),
    onError: (error: Error) => console.log(error), // TODO how to propagate?
    onCompleted: () => console.log('done') // TODO how to propagate?
  };
  // enumerator is getter/producer () => (T)
  const enumerator = {
    isReady: () => !queue.isEmpty(),
    moveNext: () => queue.dequeue(),
    current: () => queue.peep()
  };
  // return the entangled pair
  return [observer, enumerator];
}

/**
 * Ideally in a different thread
 * It feeds an observer/consumer with values produced by an enumerator
 *
 * aka counit morphism
 */
function annihilate<T>(observer: Observer<T>, enumerator: Enumerator<T> ): Disposable {
  // Here I am cheating!
  // setInterval is the simplest way to fake a sort of thread
  // We could use webworkers or a isomorphic equivalent
  const feedback = () => {
    if ( enumerator.isReady() ){
      const x: T = enumerator.current();
      observer.onNext( x );
      enumerator.moveNext();
    }
  };
  const intervalId = setInterval(feedback, 1);
  return () => clearInterval(intervalId);
}

/**
 * utility functions to get an observable from an enumerator and vice versa
 * from https://gist.github.com/ivarru/1138462)
 */

function toObservable<T>(enumerable: Enumerable<T>): Observable<T> {
  return {
    subscribe: (observer) => annihilate(observer, enumerable.getEnumerator())
  };
}

function toEnumerable<T>(observable: Observable<T>): Enumerable<T> {
  return {
    getEnumerator: () => {
      const [observer, enumerator] = producePair<T>();
      observable.subscribe(observer);
      return enumerator;
    }
  }
}

/**
 * XXX create an enumerable initizalised with a single value
 */
export function unit<T>(value: T): Enumerable<T> {
  let isReady: boolean = true;
  return {
    getEnumerator: () => ({
      isReady: () => isReady,
      moveNext: () => { isReady = false; },
      current: () => value
    })
  };
}

/**
 * XXX create an empty enumerator
 */
function empty<T>(): Enumerable<T> {
  const queue = new Queue<T>();
  return {
    getEnumerator: () => ({
      isReady: () => false,
      moveNext: () => {},
      current: () => queue.peep()
    })
  };
}

/**
 * the public API of the library
 */

/**
 * transform an interactive function into a reactive one
 *
 * It is a kind of transparent reactivity.
 * Transparent reactivity allows us to write reactive code
 * in a more familiar interactive style without callbacks or streams.
 *
 * Transparent reactivity was introduced my Meteor.
 * toReactive corresponds to Tracker.autorun in Meteor
 *
 * nb: Meteor implementation of transparent reactivity is different.
 * The intended analogy is with the observed behavior.
 */
export function toReactive<T, U>(f: (input: Enumerable<T>) => Enumerable<U>):  (input: Observable<T>) => Observable<U>{
  return function(input: Observable<T>): Observable<U> {
    const [subject, output] = makeSubject<U>();
    input.subscribe({
      onNext: (value: T) => {
        const result = f( unit<T>(value) );
        subject.onNext( result.getEnumerator().current() );
      }
    })
    return output;
  };
}

/**
 * transform a reactive function into an interactive one
 */
export function toInteractive<T, U>(f: (input: Observable<T>) => Observable<U>):  (input: Enumerable<T>) => Enumerable<U>{
  return function(input: Enumerable<T>): Enumerable<U> {
    const enumerator = input.getEnumerator();
    // consume enumerator immediately
    if ( enumerator.isReady() ){
      const value: T = enumerator.current();
      const output = f( toObservable(unit<T>(value)) );
      return toEnumerable(output);
    } else {
      return empty<U>();
    }
  };
}

/**
 * merge and split to compose and decompose observables respectively.
 */

export function merge<T, U>(x: Observable<T>, y: Observable<U>): Observable<T | U> {
  const output: Observable<T | U> = {
    subscribe: (observer: Observer<T | U>): Disposable => {
      x.subscribe(observer);
      y.subscribe(observer);
      return () => {};
    }
  };
  return output;
}

export function split<T, U>(x: Observable<T | U>, isLeft: (arg: T|U ) => arg is T): [Observable<T>, Observable<U>]{
  function subscribe() {
    return x.subscribe({
      onNext: (value: T | U) => {
        if (isLeft(value)) {
          leftObserver && leftObserver.onNext(value);
        } else {
          rightObserver && rightObserver.onNext(value);
        }
      }
    });
  }
  let leftObserver: Observer<T> | null;
  let rightObserver: Observer<U> | null;
  const left: Observable<T> = {
    subscribe: (observer: Observer<T>): Disposable => {
      leftObserver = observer;
      return () => {
        leftObserver = null;
        if (!rightObserver) dispose();
      };
    }
  };
  const right: Observable<U> = {
    subscribe: (observer: Observer<U>): Disposable => {
      rightObserver = observer;
      return () => {
        rightObserver = null;
        if (!leftObserver) dispose();
      };
    }
  };
  // XXX not fully working I think...
  const dispose = subscribe();
  return [left, right];
}

/**
 * return an observable and a paired observer as a setter
 */
export function makeSubject<T>(): [ Observer<T>, Observable<T> ] {
  const [observer, enumerator] = producePair();
  const enumerable = {
    getEnumerator: () => enumerator
  };
  return [observer, toObservable(enumerable)];
}

/**
 * trace
 */
 export function trace<X,U,Y>( f: Fun<Observable<X|U>,Observable<Y|U>>, isOutput: (arg: Y|U ) => arg is Y ): Fun<Observable<X>,Observable<Y>> {
   return function(input: Observable<X>): Observable<Y> {
     const [ consumer, inloop ] = makeSubject<U>();
     const [ output, outloop ] = split<Y,U>( f( merge<X,U>(input, inloop)), isOutput );
     // TODO when should I dispose the trace?
     const dispose = annihilate(consumer , toEnumerable(outloop).getEnumerator());
     return output;
   };
 }

/**
 * seq
 */
export function seq<X,U,Y>(
  left: Fun<Observable<X>,Observable<U>>,
  right: Fun<Observable<U>,Observable<Y>>
): Fun<Observable<X>,Observable<Y>> {
  return function(input: Observable<X>): Observable<Y> {
    return right(left(input));
  };
}

/**
 * par (async)
 */
export function par<X,Y,U,V>(
  ftop: Fun<Observable<X>,Observable<U>>,
  fbot: Fun<Observable<Y>,Observable<V>>,
  isLeft: (arg: X|Y ) => arg is X
): Fun<Observable<X|Y>,Observable<U|V>> {
  return function(input: Observable<X|Y>): Observable<U|V> {
    const [top, bottom] = split<X, Y>(input, isLeft);
    return merge<U,V>( ftop(top), fbot(bottom) );
  };
}
