# BasylBinder

A small, fast and efficient MVC Framework, built for speeding up development, in just about 4.1KB (minified + gzipped).

It supports lightweight components, live and dynamic variable bindings, persisted variables, and other features you need to build single (and multi) page applications. 

## Introduction

Have you ever wanted to start work on a new idea, but wanted to avoid bloating your new project with hundreds of kilobytes in dependencies, and developing hours of skeleton code just to get started? 

BasylBinder is a standalone web framework that currently clocks in at just about 4.1KB, and avoids all the hassle of larger MVC frameworks.

A simple "Hello name" looks like:

```html
<vars name="Richard Hendricks"></vars>
<input bind="name" /><br>
Hello <span bind="name"></span>!
```

Or even more conveniently: 

```html
<vars name="Erlich Bachman"></vars>
<input bind="name" /> <br>
<div watch="text">
    Hello {{name}}!
</div>
```

Which will generate the bindings for you automatically.

This tiny framework also supports many more features, which will be documented relatively soon.

## To Use

Just include

```html
<script src="basylbinder.min.js"></script>
```

at the top of your page, and that's all you need to get started.

## To Build

To build a minified version of the project, for both ES6 and ES5, run the following commands:

```
npm install
npm rum babel
```

## Dependencies

None. Completely Vanilla JavaScript. 

The node build tools are optional, and bundled in to make it easier to make license-compliant code.


## Examples

[Here](http://jessemitchell.me/BasylBinder/samples/index.html)

## Todo:

Documentation
