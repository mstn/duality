import { assert } from 'chai';

import {
  Observable,
  trace, seq, par,
  makeSubject,
  split,
} from '../src/index';

describe('some tests with recursive functions', () => {

  interface Input {
    kind: 'input';
    value: number;
  }

  interface Output {
    kind: 'output';
    value: number;
  }

  interface Loop {
    kind: 'loop';
    value: number;
  }

  /**
   * app implements a loop for computing factorials
   */
  const app = function( input: Observable<Input | Loop> ): Observable<Output | Loop> {
      // OMG! A side effect!
      let accl: number;
      const [ subject, output ] = makeSubject<Output|Loop>();

      input.subscribe({
        onNext: ({ kind, value }: Input | Loop ) => {
          switch ( kind ) {
            case 'input':
              if (value === 1){
                subject.onNext( { kind: 'output', value } );
              } else {
                // a new init value overrides the previous one
                // without waiting for an answer
                // for this reason we need a sort of blocking queue as Rummelhoff did
                accl = value;
                subject.onNext( { kind: 'loop', value: value-1 } );
              }
              break;
            case 'loop':
              accl *= value;
              if ( value !== 1 ){
                subject.onNext( { kind: 'loop', value: value-1 } );
              } else {
                subject.onNext( { kind: 'output', value: accl } );
              }
          }

        }
      });

      return output;
  }

  const main = trace(app, (y: Output|Loop): y is Output => y.kind === 'output' );

  it('fact([1,2,3,4]) = [1,2,6,24]', (done: any) => {
    const inputs: [number] = [2, 3, 4];
    const expectedOutputs: [number] = [1, 2, 6, 24];

    const [subject, stream] = makeSubject<Input>();

    const output = main(stream);

    const dispose = output.subscribe({
      onNext: ({value}: Output) => {
        const expected = expectedOutputs.shift();
        assert.equal(value, expected);

        // we need to wait the answer before pushing the next value
        if (inputs.length === 0 ){
          dispose();
          done();
        } else {
          const next: any = inputs.shift();
          subject.onNext( {kind: 'input', value: next} );
        }
      }
    });

    subject.onNext({kind: 'input', value: 1});

  });
});

describe('a weird way to compute n!', () => {

  interface State {
    action: string;
  }

  interface Partial extends State {
    action: 'partial';
    accl: number;
    value: number;
  }

  interface Output extends State {
    action: 'output';
    value: number;
  }

  interface Init extends State {
    action: 'init';
    input: number;
  }

  const multiplier = (input: Observable<Partial>): Observable<Partial> => {
    const [ subject, output ] = makeSubject<Partial>();
    input.subscribe({
      onNext: (x: Partial) => {
        subject.onNext({
          action: 'partial',
          accl: x.accl*x.value,
          value: x.value
        });
      }
    })
    return output;
  };

  const subtractor = (input: Observable<Partial>): Observable<Partial> => {
    const [ subject, output ] = makeSubject<Partial>();
    input.subscribe({
      onNext: (x: Partial) => {
        subject.onNext({
          action: 'partial',
          accl: x.accl,
          value: x.value-1
        });
      }
    })
    return output;
  };

  const controller = ( input: Observable<Init|Partial> ): Observable<Output|Partial> => {
    const [ subject, output ] = makeSubject<Output|Partial>();
    input.subscribe({
      onNext: (x: Init|Partial) => {
        switch(x.action){
          case 'init':
            subject.onNext({
              action: 'partial',
              accl: 1,
              value: x.input+1
            });
            break;
          case 'partial':
            if (x.value === 1){
              subject.onNext({
                action: 'output',
                value: x.accl
              });
            } else {
              subject.onNext(x);
            }
        }
      }
    });
    return output;
  }

  const identity = ( input: Observable<Output> ): Observable<Output> => input;

  const isOutput = (y: State): y is Output => y.action === 'output';

  const app = trace<Init, Partial, Output>(
    seq( controller,
      par( identity, seq(subtractor, multiplier), isOutput) ),
    isOutput
  );

  it('fact([1,2,3,4]) = [1,2,6,24]', (done: any) => {
    const inputs: [number] = [2, 3, 4];
    const expectedOutputs: [number] = [1, 2, 6, 24];

    const [subject, stream] = makeSubject<Init>();

    const output = app(stream);

    const dispose = output.subscribe({
      onNext: ({value}: Output) => {
        const expected = expectedOutputs.shift();
        assert.equal(value, expected);

        // we need to wait the answer before pushing the next value
        if (inputs.length === 0 ){
          dispose();
          done();
        } else {
          const next: any = inputs.shift();
          subject.onNext( {action: 'init', input: next} );
        }
      }
    });

    subject.onNext({action: 'init', input: 1});
  });

});

describe('cyclejs-like patterns', () => {

  // adapted from CycleJS documentation
  it('simple counter', (done: any) => {

    type HtmlDom = H1 | A;

    interface H1 {
      tagName: 'h1';
      value: string;
    }

    interface A {
      tagName: 'a';
      value: string;
      href: string;
    }

    interface Time {
      kind: 'time';
      tick: number;
    }

    interface Init {
      kind: 'init';
      mount: string;
    }

    let tick = 0;

    const clock = (): Observable<Time> => {
      const [ subject, output ] = makeSubject<Time>();
      setInterval(()=>{
        subject.onNext({kind: 'time', tick:++tick });
      }, 1);
      return output;
    };

    const dom = (dom: Observable<HtmlDom>): Observable<HtmlDom> => {
      const [ subject, output ] = makeSubject<HtmlDom>();
      dom.subscribe({
        onNext: (el: HtmlDom ) => {
          // in the real world this is where the render side effect happens
          assert.equal(el.tagName, 'h1');
          assert.equal(el.value, `${tick} ms elapsed`);
        }
      });
      return output;
    };

    const isTimeEvent = (y: any): y is Time => y.kind === 'time';
    const isInitEvent = (y: any): y is Init => y.kind === 'init';
    const isDomEvent = (y: any): y is HtmlDom => !!y.tagName
    const isVoid = (y: any): y is void => false

    const main = (input: Observable<Init|HtmlDom|Time>): Observable<HtmlDom|void> => {
      const [clock] = split<Time, HtmlDom>(input, isTimeEvent);
      const [ subject, output ] = makeSubject<HtmlDom|void>();
      const dispose = clock.subscribe({
        onNext: ({tick}: Time) => {
          if (tick > 500){
            // enough is enough!
            dispose();
            done();
          } else {
            subject.onNext({tagName: 'h1', value: `${tick} ms elapsed`});
          }
        }
      });
      return output;
    }

    const id = (x: Observable<Init>) => x;
    const drivers = par(id, par<HtmlDom,void,HtmlDom,Time>(dom, clock, isDomEvent), isInitEvent);
    const app = seq(drivers, main);
    const run = trace<Init, HtmlDom, void>(app, isVoid);

    const [ subject, input ] = makeSubject<Init>();
    run(input);
    // TODO define mounting point
    // TODO start/stop counter

  });

});
