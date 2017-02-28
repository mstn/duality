# What I would like to explore

Random thoughts.

### Lifting

Perhaps it is possible to use lifting to implement a better transparent reactivity.

```js
// this is a simple js function and user is a plain object
const app = (user: User): string => {
  console.log(`Welcome ${user.name}`);
  return user.name;
}
// in liftedApp the code of app is rerun automagically and reactively
// but we do not use streams, observables or enumerables
const liftedApp: Observable<User> => Observable<string> = lift(app);
```

Meijer has something to say about lifting in one of his talks.

### Multiple subscriptions

Now

```js
x.subscribe(observer1);
x.subscribe(observer2);
```

The second observer cancels the first one. It makes more sense if I can attach more than one observer to each observable.

### Moving boxes along the wire

It is common in Category Theory to move a morphism along the wire (I am too lazy now to find a reference). The same idea could be applied in this context. For example, let us assume to have a trace with a function from observable to observable like the following:

```
+-------------+
|             |
|   +-----+   |
+---+  f  +---+
    +----o+
```

Then we can slide f and obtain the equivalent non-reactive version.

```             
    +o----+   
+---+  f  +---+
|   +-----+   |
|             |
+-------------+
```

It could be useful to define drivers (aka side effects) in a more familiar non-reactive style.
Note also that functions on the top could run in a different thread. Perhaps, it could be a nice way to build multi-threading applications (aka webworkers!).

### How to implement CycleJS (proxy, drivers, ...)

Imo Cycle run is equivalent to a diagram of this shape, where `d` are drivers, `f` the main application and the free input the init values.

```
+---------------------+
|  +-----+            |
+--+  d  +----+-----+ |
   +-----+    |  f  +-+
+-------------+-----+
```
