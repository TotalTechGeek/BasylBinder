/*! 
 * BasylBinder
 * 
 * Copyright 2018, Jesse Daniel Mitchell
 * Released under the MIT license.
 *
 * Date: 2018-04-22T22:35:32.502Z
 */
if (typeof window.$$ === "undefined")
{
    $$ = function(e)
    {
        if (e instanceof Event ||e instanceof HTMLElement || typeof e === "object")
        {
            return $$.from(e);
        }
    }
}
else
{
    var z = window.$$;
    $$ = function(e, x)
    {
        if (e instanceof Event || e instanceof HTMLElement || typeof e === "object")
        {
            return $$.from(e);
        }

        return z(e, x);
    }
}

function createBasylBinder($$)
{
    $$.bindings = {}
    $$.components = {}
    let bindUpdates = {}
    let updates = {}
    let ignore = null

    // used to make duplicates or to simply
    // convert node lists to arrays
    function _toConsArray(nodeList)
    {
        let arr = []
        for(let i = 0; i < nodeList.length; i++) arr.push(nodeList[i])
        return arr
    }

    const LOCAL_BIND_ID = "local-bind";
    const BASYL_VARS = "vars";
    const BASYL_SCRIPT = 'script[type="basyl-script"]';
    const BASYL_STYLE = 'script[type="basyl-style"]';
    const BASYL_PVARS = "pvars";
    const BASYL_SVARS = "svars";
    const BASYL_PVAR_PREFIX = 'bb_';


    /**
     * Queues an update, delays previous attempts at an update.
     * 
     * @param {*} name 
     * @param {*} time 
     */
    $$.queue = function(name, time)
    {
        if (typeof updates[name] !== "undefined")
        {
            clearTimeout(updates[name]);
        }

        updates[name] = setTimeout(() =>
        {
            $$.update(name);
            delete updates[name];
        }, time);
        
        return $$
    }

    /**
     * Creates a delayed binding. 
     * Cancels an update upon new updates.
     * 
     * @param {*} source 
     * @param {*} to 
     * @param {*} time 
     */
    $$.delay = function(source, to, time)
    {
        $$.bind(source, () => $$.queue(to, time))
        return $$
    }

    /**
     * Forces all queued updates to execute now.
     */
    $$.now = function()
    {
        Object.keys(updates).forEach(name =>
        {
            clearTimeout(updates[name])
            $$.update(name)
            delete updates[name]
        })

        return $$
    }

    /**
     * Used to create a component to append to the body
     * @param {*} html HTML String - Be careful, this is not escaped.
     */
    function htmlToElement(html) 
    {
        html = html.trim(); 
        let template = document.createElement('template');
        
        // Silly shim for IE11, since that's still around :/
        if (!template.content)
        {
            template = document.createElement('div')
            template.innerHTML = html;
            return template.childNodes[0]
        }
        
        template.innerHTML = html;
        return template.content.firstChild;
    }


    /**
     * Used to make a component. 
     * @param {String} type The component type.
     * @param {Object} vars The variables to load into the component.
     */
    $$.make = function(type, vars)
    {
        let varTag = ''
        if(vars)
        {
            varTag = '<vars '

            Object.keys(vars).forEach(i=>
            {
                varTag += i.replace(/ /g, '') + '="' + vars[i] + '"'
            })

            varTag += '></vars>'
        }
        
        return { 
            appendTo: (el) => 
            {
                let el2 = htmlToElement(`<component type="${type}" from>` + varTag +  `</component>`)
                el.setAttribute('basyl-now', '')
                el.appendChild(el2)
                $$.all('[basyl-now]')
                el.removeAttribute('basyl-now')
                return $$.from(el2)
            }
        }
    }

    /**
     * Binds a variable to another variable, or a variable to a function.
     * @param {*} name 
     * @param {*} n 
     */
    $$.bind = function(name, n)
    {
        htmlvars(' ')
        name = name.toLowerCase()
        if (typeof n === "string") n = n.toLowerCase()
        if (typeof $$.bindings[name] !== "undefined")
        {
            $$.bindings[name][2].push(n);
        }
        return $$;
    }

    /**
     * Erases a variable from existence.
     * @param {*} name 
     */
    $$.forget = function(name)
    {
        name = name.toLowerCase()
        delete $$.bindings[name];
        return $$;
    }

    let emptyFunction = () => {}

    /**
     * Binds a format to an element.
     * Used internally. Do not call directly.
     * 
     * @param {*} el 
     * @param {*} func 
     */
    function bindElementFormat(el, func)
    {
        el.value = func(el.value);
        let prev = el.onchange || emptyFunction;
        el.onchange = e =>
        {
            e.target.value = func(e.target.value);
            prev(e);
            el.oninput && el.oninput(e);
        }
        return $$;
    }

    /**
     * Binds an element to a normal variable. 
     * Used internally. Do not call directly. 
     * 
     * @param {*} name 
     * @param {*} el 
     * @param {*} attr 
     * @param {*} oneWay 
     */
    function bindElementNormal(name, el, attr, oneWay)
    {
        if (!oneWay)
        {
            // If it isn't one way, update the current value and tell it to update this value
            $$.bindings[name][2].push([el, attr]);
            el[attr] = $$.bindings[name][0]();
        }

        bindElementFinal(name, el, attr, () => $$.get(name), val => $$.set(name, val))
    }


    /**
     * Extracted for optimization purposes.
     * Updates from most types of inputs.
     * 
     * @param {*} e 
     * @param {*} name 
     * @param {*} el 
     * @param {*} attr 
     * @param {*} get 
     * @param {*} set 
     */
    function updateFromInput(e, name, el, attr, get, set)
    {
        // Garbage Collection
        if (typeof $$.bindings[name] === "undefined")
        {
            delete el.oninput;
            return;
        }

        // checks if the input is different 
        if (get() != e.target[attr])
        {
            ignore = e.target
            set(e.target[attr])
            ignore = null
        }
    }

    /**
     * Used to update from other type of fields, like checkboxes 
     * and selects 
     * 
     * @param {*} e 
     * @param {*} name
     * @param {*} el 
     * @param {*} attr 
     * @param {*} get 
     * @param {*} set 
     */
    function updateFromOther(e, name, el, attr, get, set)
    {
        // Garbage Collection
        if (typeof $$.bindings[name] === "undefined")
        {
            delete el.oninput;
            return;
        }

        // If the current value is not the same as the new one
        if (get() != e.target[attr])
        {
            // use this to prevent an update to the element
            ignore = e.target 

            // Because it's a checkbox, check if there's an on-true value it should be set to
            if (el.hasAttribute("on-true") && e.target[attr] == true)
            {
                set(el.getAttribute("on-true"))
            }
            // or an on-false
            else if (el.hasAttribute("on-false") && e.target[attr] == false)
            {
                set(el.getAttribute("on-false"))
            }
            // otherwise just use the actual value
            else
            {
                set(e.target[attr])
            }

            ignore = null
        }
    }

    /**
     * Final step in binding an element to a variable.
     * Used internally.
     * 
     * @param {*} name 
     * @param {*} el 
     * @param {*} attr 
     * @param {*} get 
     * @param {*} set 
     */
    function bindElementFinal(name, el, attr, get, set)
    {
        // If it's some sort of editable field
        // There's a small bug here I'll fix later, I need to actually check if the content-editable field is set to true.
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.hasAttribute("contenteditable") || el instanceof HTMLSelectElement)
        {
            // If it's a checkbox or a file or select
            if (el.attributes["type"] && (el.getAttribute("type") === "checkbox" || el.getAttribute("type") === "file") || el instanceof HTMLSelectElement)
            {
                el.onchange = e => updateFromOther(e, name, el, attr, get, set)
            }
            else
            {
                // Good for most types of input...
                el.oninput = e => updateFromInput(e, name, el, attr, get, set)
            }
        }

    }

    /**
     * First step in binding an element to a variable. 
     * Used internally.
     *  
     * @param {*} name 
     * @param {*} el 
     * @param {*} attr 
     * @param {*} oneWay 
     */
    function bindElement(name, el, attr, oneWay)
    {
        oneWay = (typeof oneWay === "undefined") ? false : oneWay;
        name = closest2(el, name);

        // Checks if the binding exists, and the element we're binding to exists.
        if (typeof $$.bindings[name] !== "undefined" && typeof el !== "undefined")
        {
            bindElementNormal(name, el, attr, oneWay)
        }
        return $$;
    }

    /**
     * Creates a 'variable' you can access from the provided getters and setters.
     * 
     * @param {*} name 
     * @param {*} getter 
     * @param {*} setter 
     */
    $$.create = function(name, getter, setter)
    {
        name = name.toLowerCase()
        getter = getter || emptyFunction;
        setter = setter || emptyFunction;
        bindUpdates[name] = false;
        $$.bindings[name] = [getter, setter, []];
        return $$;
    }

    /**
     * Creates a 'view' of a variable, which is basically a transformation of the source variable.
     * 
     * It will automatically bind the first variable to the second.
     * 
     * @param {String} name 
     * @param {String} formattedName 
     * @param {Function} mutator 
     */
    $$.createView = function(name, formattedName, mutator)
    {
        name = name.toLowerCase(), formattedName = formattedName.toLowerCase()
        if (typeof $$.bindings[name] === "undefined") htmlvars(' ');
        $$.create(formattedName, () => mutator($$.get(name)));
        $$.bind(name, formattedName);
        return $$;
    }
    
    /**
     * Updates a variable.
     * @param {String} name 
     */
    $$.update = function(name)
    {
        name = name.toLowerCase()

        if (typeof $$.bindings[name] !== "undefined")
        {
            if (bindUpdates[name]) return $$;
            bindUpdates[name] = true;
            $$.bindings[name][2].forEach(x =>
            {
                if (typeof x === "string")
                {
                    $$.update(x);
                }
                else if (typeof x === "function")
                {
                    x($$.get(name));
                }
                else
                {
                    // Don't update the current element.
                    if(ignore != x[0])
                    {
                        // update the element
                        x[0][x[1]] = $$.bindings[name][0]();                 
                    }
                    else
                    {
                        // otherwise, update it when the element is blurred.
                        x[0].onblur = () =>
                        {
                            x[0][x[1]] = $$.bindings[name][0]();
                            delete x[0].onblur
                        }       
                    }
                }
            });

            bindUpdates[name] = false;
        }

        return $$;
    }

    /**
     * Gets a variable.
     * @param {*} name 
     */
    $$.get = function(name)
    {
        name = name.toLowerCase()
        if (typeof $$.bindings[name] !== "undefined")
        {
            return $$.bindings[name][0]();
        }
    }

    /**
     * Sets a variable
     * @param {*} name 
     * @param {*} v 
     */
    $$.set = function(name, v)
    {
        name = name.toLowerCase();
        if (typeof $$.bindings[name] !== "undefined")
        {
            if (bindUpdates[name]) return;
            
            // Checks if the setter exists
            if($$.bindings[name][1])
            {                
                $$.bindings[name][1](v);
                $$.update(name);    
            }
        }
        return $$;
    }
    
    // shim for slightly older browsers
    if (!Element.prototype.matches) {
        Element.prototype.matches = Element.prototype.msMatchesSelector;
    }

    /**
     * Used internally to find the closest variable match.
     * @param {*} el 
     * @param {*} key 
     */
    function closest2(el, key)
    {
        key = key.toLowerCase();
        let y;
        if (y = $$.closest(el, key))
        {
            return y.getAttribute(LOCAL_BIND_ID).toLowerCase() + ':' + key;
        }

        if (typeof $$.bindings[key] !== "undefined")
            return key;

        return null;
    }

    /**
     * Finds the closest local-bind.
     * @param {*} el 
     * @param {*} key 
     * @param {*} selector 
     */
    $$.closest = function(el, key, selector)
    {
        selector = (typeof selector === "undefined") ? "[" + LOCAL_BIND_ID + "]" : selector;
        let retval = null;
        while (el)
        {
            if (el.matches(selector))
            {
                if (typeof key === "undefined" || key === "" || typeof $$.bindings[el.getAttribute(LOCAL_BIND_ID).toLowerCase() + ':' + key.toLowerCase()] !== 'undefined')
                {
                    retval = el;
                    break
                }
            }
            el = el.parentElement;
        }
        return retval;
    }

    function randStr() 
    {
        return Math.random().toString(36).substring(2)
    }

    function htmlDecode(input)
    {
        let doc = new DOMParser().parseFromString(input, "text/html");
        return doc.documentElement.textContent;
    }

    $$.from = function(x)
    {
        if (typeof x === "string")
        {
            let sub = x.substring(1), type = x[0]

            if(type == '#') return $$.from(document.getElementById(sub))
            else if(type == '*') return $$.from(document.querySelectorAll(sub))
            else if(type == '$') return $$.from(document.querySelector(sub))
            else if(type == '&') return $$.from($$.search(sub))
            else if(type == '@') return $$.from($$.search(sub).map($$.get))
        }

        let result = {};

        // gives the underlying variable we're processing
        result.release = () => x

        if(x instanceof Event)
        {
            x = x.target
        }

        if (x instanceof HTMLElement)
        {
            function escapeRegExp(str)
            {
                return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
            }

            function onlyUnique(value, index, self)
            {
                return self.indexOf(value) === index;
            }

            if (x instanceof HTMLInputElement)
            {
                result.bind = function(name, oneWay)
                {
                    bindElement(name, x, "value", oneWay);
                    return result;
                }
        
                result.format = function(func)
                {
                    bindElementFormat(x, func);
                    return result;
                }
            }
            else 
            {
                result.bind = function(name, attr, oneWay)
                {
                    bindElement(name, x, attr, oneWay);
                    return result;
                }
            }
            
            /**
             * Used to create the local-bind variants of each of the
             * variable creation types.
             * 
             * @param {*} func 
             */
            function localBindVariant(func, vars)
            {
                return function()
                {
                    let y;
                
                    if (y = $$.closest(x))
                    {
                        y = y.getAttribute(LOCAL_BIND_ID);
                        let a = _toConsArray(arguments)
                        vars.forEach(i=> 
                        {
                            if(typeof a[i] === 'string')
                            {
                                if(typeof i === 'string')
                                {
                                    a[i] = closest2(x, a[i | 0])
                                }
                                else
                                {
                                    a[i] = y + ':' + a[i]
                                }
                            }
                        })

                        func.apply(null, a)
                        return result
                    }
                    
                    func.apply(null, arguments)
                    return result
                }
            }

            result.create = localBindVariant($$.create, [0])
            result.var = localBindVariant($$.var, [0])
            result.const = localBindVariant($$.const, [0])
            result.createView = localBindVariant($$.createView, ['0', 1])
            result.bind = localBindVariant($$.bind, ['0', '1'])
            result.delay = localBindVariant($$.delay, ['0', '1'])

            // This is a mess and needs documentation.
            result.watch = function(name)
            {
                let orig = name
                let optimize = false
                let prop = false

                // creates bindings to html / text 
                if (name == "html" || name == "text") 
                { 
                    name = "innerHTML";
                    prop = optimize = true
                } 
                
                // specifies that it is a property and not an attribute
                // and also tells it to attempt to optimize it
                if (name.charAt(0) == "*")
                {
                    name = name.substring(1)
                    prop = optimize = true 
                }

                // if innerHTML, but a style/script, disable optimization. It doesn't always turn out correctly.
                if(name === "innerHTML")
                {
                    if (x instanceof HTMLStyleElement || x instanceof HTMLScriptElement) 
                    {
                        optimize = false
                    }
                }  
                

                // The string of data that needs to get parsed
                let str;
                
                if (prop) 
                { 
                    // grabs the property from the element
                    str = x[name]; 
                }
                else 
                {
                    // grabs the attribute from the element
                    str = x.getAttribute(name) || "";
                }

                // extracts the values and their lambdas (if they exist)
                let vals = (str.toString().match(/\{\{[A-Za-z0-9\-_#]+(\|[^}]+(\}[^}]+)?)*\}\}/g) || []).map(i =>
                {
                    let valsThenLambdas = i.substring(2, i.length - 2).split("|")
                    let val = valsThenLambdas[0];
                    valsThenLambdas[0] = "";
                    return [val.toLowerCase(), valsThenLambdas.join("|").substring(1), escapeRegExp(i)];
                });

                
                // removes duplicates
                vals = vals.filter(v => closest2(x, v[0])).filter(onlyUnique);

                // creates the regular expressions
                let regExpressions = vals.map(i => new RegExp(i[2], "g"));

                let func = () =>
                {
                    let data = str.toString();
                    if (optimize)
                    {
                        $$.from(x.childNodes).for((it, i) =>
                        {
                            if (it instanceof HTMLElement)
                            {
                                // iterate over each of the internal elements to replace values and create bindings
                                $$.from(it).watch(orig);

                                // iterate over each of the attributes to replace values and create bindings
                                $$.from(it.attributes).for(i =>
                                {
                                    if (regExpressions.some(k => i.value.match(k))) $$.from(it).watch(i.name);
                                })
                            }
                            else if (it instanceof Text)
                            {
                                data = it.data;

                                if (data.trim() !== "")
                                {
                                    regExpressions.forEach((j, i) =>
                                    {
                                        // finds the closest binding (if in a localScope)
                                        let bound = closest2(x, vals[i][0]);

                                        // Generates random string bindings for the lambdas, to make it easier.
                                        if (vals[i][1] !== "")
                                        {
                                            // generates a bound name
                                            bound = randStr() + randStr();

                                            // creates the binding for the lambda
                                            $$.createView(vals[i][0], bound, new Function(vals[i][0], "return " + htmlDecode(vals[i][1])));
                                        }
                                        
                                        // sets the binding type (html vs text)
                                        let bindType = (orig == "*innerHTML" || orig == "html") ? 'bind-to="innerHTML"' : '';
                                        
                                        // add a bound element to the html
                                        data = data.replace(j, '<v bind="' + bound + '"' + bindType + '></v>');
                                    })

                                    // insert the bound elements
                                    it.parentNode.replaceChild(new DOMParser().parseFromString("<v>" + data + "</v>", "text/html").childNodes[0].childNodes[1].childNodes[0], it);
                                }
                            }
                        });
                    }
                    else
                    {
                        // If un-optimized, it just updates the entire attribute by replacing parts of the string
                        regExpressions.forEach((j, i) =>
                        {
                            // if there is lambda code, 
                            if (vals[i][1] !== "")
                            {
                                // create the lambda
                                let lam = new Function(vals[i][0], "return " + vals[i][1]);
                                
                                // replace the bound variables with the data (after parsing it with the lambda)
                                data = data.replace(j, lam($$(x).get(vals[i][0])));
                            }
                            else
                            {
                                // replace the bound variables                                
                                data = data.replace(j, $$(x).get(vals[i][0]));
                            }
                        })

                        if (prop)
                        {
                            x[name] = data;                        
                        }
                        else
                        {
                            x.setAttribute(name, data);                        
                        }
                    }
                }

                // for the non-optimized values, create the binding function 
                vals.forEach(i =>
                {
                    if (!optimize)
                        result.bind(i[0], func);
                })

                func();
            }

            result.get = function(z)
            {
                return $$.get(closest2(x, z));
            }

            result.update = function(z)
            {
                $$.update(closest2(x, z))
                return result
            }

            result.search = function(z)
            {
                return $$.search(z, x)
            }

            result.from = function(z)
            {
                let sub = z.substring(1), type = z[0]
                if(type == '*') return $$.from(x.querySelectorAll(sub))
                else if(type == '$') return $$.from(x.querySelector(sub))
                else if(type == '&') return $$.from($$.search(sub, x))
                else if(type == '@') return $$.from($$.search(sub, x).map($$.get))
            }

            result.set = function(z, v)
            {
                $$.set(closest2(x, z), v);
                return result
            }

            return result;
        }

        if (Array.isArray(x))
        {
            result.do = func => x.map(func);
            result.for = func => x.forEach(func);
        }
        else
        {
            // similar to a forEach function
            result.for = func =>
            {
                for (let i = 0; i < x.length; i++)
                {
                    func(x[i], i);
                }
            }

            // similar to a map function
            result.do = func =>
            {
                let result = [];
                for (let i = 0; i < x.length; i++)
                {
                    result.push(func(x[i], i));
                }
                return result;
            }
        }

        // filters the data structure internally
        result.filter = func =>
        {
            // converts to an array if necessary
            result._arrayFix()
            
            for(let i = 0; i < x.length; i++)
            {
                // if it doesn't test true, remove it from the array
                if(!func(x[i]))
                {
                    x.splice(i, 1)
                    i-- 
                }
            }

            return result
        }

        // converts node lists and similar iterable structures to an array
        result.toArray = () => x = _toConsArray(x)

        // a check and then an execution of the conversion
        result._arrayFix = () => !Array.isArray(x) && result.toArray()

        // transforms the data internally
        result.transform = func =>
        {
            result._arrayFix()

            for(let i = 0; i < x.length; i++)
            {
                x[i] = func(x[i], i)
            }

            return result
        }

        // transposes a matrix
        result.transpose = () =>
        {
            let transpose = (y, i) => x[i].map((y, i) => x.map(y => y[i]))
            let cur = depth()[0];
            return transpose(x, cur);
        }

        function depth() 
        {
            let max = 0,
                cur = 0;
            for (let i = 0; i < x.length; i++)
            {
                if (x[i].length > max)
                {
                    max = x[i].length;
                    cur = i;
                }
            }
            return [cur, max];
        }

        result.sum = () => 
        {
            result._arrayFix()
            return x.concat([0]).reduce((val, sum) => (parseFloat(sum) + parseFloat(val)) || 0)
        }

        result.ffor = (y, z) =>
        {
            for (let i = 0; i < x.length; i++)
            {
                z(x[i]) && y(x[i], i);
            }
        }

        result.table = function(options)
        {
            if(!options) options = {}
            if (typeof options.fill === "undefined") options.fill = "";
            if (typeof options.head === "undefined") options.head = [];
            let max = depth()[1];

            // Used to wrap the elements. with <> and </>
            function wrap(x, el)
            {
                return "<" + el + ">" +  x + "</" + el + ">"
            }

            for (let i = 0; i < x.length; i++)
            {
                while (x[i].length < max) x[i].push("");
            }

            let tbody = wrap(x.map(i=>wrap(i.map(j =>wrap(j || options.fill, "td")).join(""), "tr")).join(""), "tbody");
            let thead = "";

            if (options.head.length)
            {
                thead = wrap(wrap(options.head.map(i=>wrap(i, "th")).join(''), "tr"), "thead");
            }

            return wrap(thead + tbody, "table");
        }

        result.fdo = (y, z) =>
        {
            let result = [];
            for (let i = 0; i < x.length; i++)
            {
                let item = z(x[i]) ? y(x[i], i) : null;
                if (item !== undefined && item !== null)
                {
                    result.push(item);
                }
            }
            return result;
        }

        return result;
    }

    $$.templates = {
        getInt: (v) => parseInt(v.val) || 0,
        getPosInt: (v) =>
        {
            let x = parseInt(v.val)
            return x < 0 ? -x : x || 0
        },
        getFloat: (v) => parseFloat(v.val) || 0,
        getAny: (v) => typeof v.val !== "undefined" ? v.val : "",
        setInt: (t, v) => t.val = parseInt(v),
        setFloat: (t, v) => t.val = parseFloat(v),
        setAny: (t, v) => t.val = v
    }

    $$._CV = function(v, g, s)
    {
        let obj = {}
        obj.val = typeof v !== "undefined" ? v : "";
        let get = g ? g : $$.templates.getAny;
        let set = s ? s : $$.templates.setAny;
        obj.set = v => set(obj, v);
        obj.get = () => get(obj);
        return obj;
    }

    $$.search = function(name, from)
    {
        let search = (name) => Object.keys($$.bindings).filter(i => i.match(name));

        if(from)
        {
            if(typeof from === 'string')
            {
                return $$.search(name, document.querySelector(fromFix(from)))
            }
            else
            {
                let closest = $$.closest(from)
                if(closest)
                {
                    let arr = []

                    $$.from(closest.querySelectorAll('[' + LOCAL_BIND_ID + ']')).for(i=>
                    {
                        arr.push.apply(arr, search(i.getAttribute(LOCAL_BIND_ID) + ':' + name) || [])
                    })
                    
                    arr.push.apply(arr, search(closest.getAttribute(LOCAL_BIND_ID ) + ':' + name) || [])

                    return arr
                }
            }
        }

        return search(name)
    }

    // This will be fleshed out later on.
    // This will allow you to specify constant variables that won't change.
    // This will prevent bindings from being a big deal
    $$.const = function(name, v)
    {
        return $$.create(name, () => v);
    }

    
    /**
     * Creates a persisted variable.
     * Only works in global scope.
     * 
     * @param {*} name 
     * @param {*} v 
     * @param {*} g 
     * @param {*} s 
     */
    $$.pvar = function(name, v, g, s)
    {
        if($$.bindings[name]) return

        const index = BASYL_PVAR_PREFIX + name;

        if(!localStorage[index])
            localStorage[index] = v

        let set = val =>
        {
            localStorage[index] = val
        }

        let get = () =>
        {
            return localStorage[index]
        }

        $$.create(name, get, set)
        
        return $$
    }

    $$.var = function(name, v, g, s)
    {
        let a = new $$._CV(v, g, s);
        $$.create(name, a.get, a.set);
        return $$;
    }

    $$.range = function(x, y)
    {
        return _toConsArray(Array(y - x + 1).keys()).map(i => i + x);
    }

    /**
     * Creates local-binds, which encapsulate the variables within a section of the document.
     * 
     * @param {*} from 
     */
    function localScopes(from)
    {
        $$.from('*' + from + "[" + LOCAL_BIND_ID + "]").for(i =>
        {
            if (i.getAttribute(LOCAL_BIND_ID) === "")
            {
                i.setAttribute(LOCAL_BIND_ID, randStr());
            }
        });
    }

    /**
     * Creates bindings to stylesheets
     */
    function style(from)
    {        
        $$.from('*' + from + BASYL_STYLE).for(i =>
        {
            let a = document.createElement("style");
            a.innerHTML = i.innerHTML;
            i.parentNode.replaceChild(a, i);
            $$.from(a).watch("html");
        });
    }

    /**
     * Creates bb variables from the HTML
     * @param {*} from 
     */
    function htmlvars(from)
    {
        localScopes(from);

        function varSetup(type, func)
        {
            $$.from('*' + from + type).for(el =>
            {
                $$.from(el.attributes).for(i => $$.from(el)[func](i.name, i.value));
                el.parentNode.removeChild(el)
            })
        }
        
        varSetup(BASYL_VARS, 'var')
        varSetup(BASYL_SVARS, 'const')

        $$.from('*' + from + BASYL_PVARS).for(el =>
        {
            // pvars have global scope by design.
            $$.from(el.attributes).for(i=>$$.pvar(i.name, i.value));
            el.parentNode.removeChild(el);
        });
       
        return $$;
    }

    /**
     * Declares the component templates.
     * @param {*} from 
     */
    function componentInit(from)
    {
        $$.from('*' + from + "component[make]").for(y =>
        {
            $$.components[y.getAttribute("type")] = [y.innerHTML];
            y.parentNode.removeChild(y);
        });
    }

    /**
     * Creates the component templates.
     * Should be executed from "all"
     * @param {*} from 
     */
    function componentMake(from)
    {
        $$.from('*' + from + "component[from]").for(y =>
        {
            let type = y.getAttribute("type")
        
            y.setAttribute("was-from", true);
            y.removeAttribute("from");
            y.setAttribute("watch", "html");
            
            let extraVars = y.querySelectorAll(BASYL_VARS + "," + BASYL_SVARS)
            
            y.innerHTML = $$.components[type][0];
            $$.from(extraVars).for(i=>y.appendChild(i))
            
            if(extraVars.length) y.setAttribute('local-bind', '')
        })
    }

    function fromFix(from)
    {
        return (typeof from === "undefined") ? "" : (from + " ")
    }

    function basylIf(from)
    {
        $$.from('*' + from + "[basyl-if]:not(basyl-if-watched)").for(y =>
        {
            let j;
            let bind = y.getAttribute("basyl-if");
            let lam = x => x;

            if ((j = bind.indexOf('|')) != -1)
            {
                lam = new Function(bind.substring(0, j), 'return ' + bind.substring(j + 1));
                bind = bind.substring(0, j);
            }

            let def = y.style.display;
            bind = closest2(y, bind);

            $$.bind(bind, () =>
            {
                if (lam($$.get(bind))) y.style.display = def;
                else y.style.display = "none";
            });

            if (lam($$.get(bind))) y.style.display = def;
            else y.style.display = "none";

            y.setAttribute("basyl-if-watched", bind);
            y.removeAttribute("basyl-if");
        });
    }

    function basylScript(from)
    {
        $$.from('*' + from + BASYL_SCRIPT).for(y =>
        {
            new Function('me', y.textContent)($$.from(y))
            y.innerHTML = ''
        });
    }

    function basylWatch(from)
    {        
        $$.from('*' + from + "[watch]:not([watched])").for(y =>
        {
            let watched = y.getAttribute("watch").split(" ");
            $$.from(watched).for(i =>
            {
                $$.from(y).watch(i);
            });

            y.setAttribute("watched", y.getAttribute("watch").toLowerCase());
            y.removeAttribute("watch");
        })
    }

    function basylBind(from, attempt)
    {        
        attempt = (typeof attempt === "undefined") ? 0 : attempt;        
        
        $$.from('*' + from + '[bind]:not([bound])').for((y) =>
        {
            let bind = closest2(y, y.getAttribute("bind"));
            if (typeof $$.bindings[bind] === "undefined")
            {
                attempt++;
                if (attempt < 4)
                    setTimeout(() => basylBind(from, attempt), attempt * 200);
                return;
            }

            let oneWay = typeof y.attributes["one-way"] !== "undefined";
            
            let bindTo
            
            // Create the default bind to for each of the elements
            if(typeof y.attributes["bind-to"] === "undefined")
            {
                if(y instanceof HTMLInputElement)
                {
                    // if it's an input element
                    if (typeof y.attributes["type"] === "object" && y.getAttribute("type") === "checkbox")
                    {
                        // if it's a checkbox, bind to checked                        
                        bindTo = "checked"
                    }
                    else
                    {
                        // otherwise bind to value
                        bindTo = "value"
                    }
                } 
                else if (y instanceof HTMLTextAreaElement || y instanceof HTMLSelectElement)
                {
                    // if it's a select or text area, bind to value
                    bindTo = "value"
                }
                else
                {
                    // otherwise, bind to text content
                    bindTo = "textContent"
                } 
            }
            else
            {
                // if there's a bind-to tag, bind-to it.
                bindTo = y.getAttribute("bind-to")
            }
            
            y.setAttribute("bound", bind);
            y.removeAttribute("bind");

            bindElement(bind, y, bindTo, oneWay);
        });

    }

    /**
     * The main function that should be used with BasylBinder.
     * Executes the bind operations in the correct order. (usually)
     * 
     * @param {*} from 
     */
    $$.all = function(from)
    {
        from = fromFix(from)
        
        // Component Code
        componentInit(from)
        componentMake(from)

        htmlvars(from)

        style(from)
        basylScript(from)        
        basylWatch(from)
        basylBind(from)
        basylIf(from)
    }
}

createBasylBinder($$);

// automatically executes $$.all on load.
addEventListener("load", () => $$.all())