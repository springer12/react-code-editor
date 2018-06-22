/* @flow */
/* eslint-disable react/no-danger, react/sort-comp */

import React from 'react';

type Props = {
  value: string,
  onValueChange: (value: string) => mixed,
  highlight: (value: string) => string,
  tabSize: number,
  insertSpaces: boolean,
  padding: number,
  style?: {},
};

type State = {
  value: string,
  html: string,
};

type Record = {
  value: string,
  selectionStart: number,
  selectionEnd: number,
};

type History = {
  stack: Array<Record & { timestamp: number }>,
  offset: number,
};

const KEYCODE_ENTER = 13;
const KEYCODE_TAB = 9;
const KEYCODE_BACKSPACE = 8;
const KEYCODE_Z = 90;

const HISTORY_LIMIT = 100;
const HISTORY_TIME_GAP = 3000;

export default class Editor extends React.Component<Props, State> {
  static defaultProps = {
    tabSize: 2,
    insertSpaces: true,
    padding: 0,
  };

  static getDerivedStateFromProps(props: Props, state: State) {
    if (props.value !== state.value) {
      return {
        value: props.value,
        html: props.highlight(props.value),
      };
    }

    return null;
  }

  state = {
    value: this.props.value,
    html: this.props.highlight(this.props.value),
  };

  componentDidMount() {
    this._recordCurrentState();
  }

  _recordCurrentState = () => {
    const input = this._input;

    if (!input) return;

    // Save current state of the input
    const { value, selectionStart, selectionEnd } = input;

    this._recordChange({
      value,
      selectionStart,
      selectionEnd,
    });
  };

  _recordChange = (record: Record, overwrite?: boolean = false) => {
    const { stack, offset } = this._history;

    if (stack.length && offset > -1) {
      // When something updates, drop the redo operations
      this._history.stack = stack.slice(0, offset + 1);

      // Limit the number of operations to 100
      const count = this._history.stack.length;

      if (count > HISTORY_LIMIT) {
        const extras = count - HISTORY_LIMIT;

        this._history.stack = stack.slice(extras, count);
        this._history.offset = Math.max(this._history.offset - extras, 0);
      }
    }

    const timestamp = Date.now();

    if (overwrite) {
      const last = this._history.stack[this._history.offset];

      if (last && timestamp - last.timestamp < HISTORY_TIME_GAP) {
        // A previous entry exists and was in short interval

        // Match the last word in the line
        const re = /[^a-z0-9]([a-z0-9]+)$/i;

        // Get the previous line
        const previous = last.value
          .substring(0, last.selectionStart)
          .split('\n')
          .pop()
          .match(re);

        // Get the current line
        const current = record.value
          .substring(0, record.selectionStart)
          .split('\n')
          .pop()
          .match(re);

        if (previous && current && current[1].startsWith(previous[1])) {
          // The last word of the previous line and current line match
          // Overwrite previous entry so that undo will remove whole word
          this._history.stack[this._history.offset] = { ...record, timestamp };

          return;
        }
      }
    }

    // Add the new operation to the stack
    this._history.stack.push({ ...record, timestamp });
    this._history.offset++;
  };

  _updateInput = (record: Record) => {
    const input = this._input;

    if (!input) return;

    // Update values and selection state
    input.value = record.value;
    input.selectionStart = record.selectionStart;
    input.selectionEnd = record.selectionEnd;

    this.props.onValueChange(record.value);
  };

  _applyEdits = (record: Record) => {
    // Save last selection state
    const input = this._input;
    const last = this._history.stack[this._history.offset];

    if (last && input) {
      this._history.stack[this._history.offset] = {
        ...last,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
      };
    }

    // Save the changes
    this._recordChange(record);
    this._updateInput(record);
  };

  _undoEdit = () => {
    const { stack, offset } = this._history;

    // Get the previous edit
    const record = stack[offset - 1];

    if (record) {
      // Apply the changes and update the offset
      this._updateInput(record);
      this._history.offset = Math.max(offset - 1, 0);
    }
  };

  _redoEdit = () => {
    const { stack, offset } = this._history;

    // Get the next edit
    const record = stack[offset + 1];

    if (record) {
      // Apply the changes and update the offset
      this._updateInput(record);
      this._history.offset = Math.min(offset + 1, stack.length - 1);
    }
  };

  _handleKeyDown = (e: *) => {
    const { tabSize, insertSpaces } = this.props;
    const { value, selectionStart, selectionEnd } = e.target;

    const tabCharacter = (insertSpaces ? ' ' : '     ').repeat(tabSize);

    if (e.keyCode === KEYCODE_TAB) {
      // Prevent focus change
      e.preventDefault();

      if (selectionStart === selectionEnd) {
        const updatedSelection = selectionStart + tabCharacter.length;

        this._applyEdits({
          // Insert tab character at caret
          value:
            value.substring(0, selectionStart) +
            tabCharacter +
            value.substring(selectionEnd),
          // Update caret position
          selectionStart: updatedSelection,
          selectionEnd: updatedSelection,
        });
      } else {
        // Indent selected lines
        const startLine =
          value.substring(0, selectionStart).split('\n').length - 1;
        const endLine = value.substring(0, selectionEnd).split('\n').length - 1;

        this._applyEdits({
          value: value
            .split('\n')
            .map((line, i) => {
              if (i >= startLine && i <= endLine) {
                return tabCharacter + line;
              }

              return line;
            })
            .join('\n'),
          // Update caret position
          selectionStart: selectionStart + tabCharacter.length,
          selectionEnd:
            selectionEnd + tabCharacter.length * (endLine - startLine + 1),
        });
      }
    } else if (e.keyCode === KEYCODE_BACKSPACE) {
      const hasSelection = selectionStart !== selectionEnd;
      const textBeforeCaret = value.substring(0, selectionStart);

      if (textBeforeCaret.endsWith(tabCharacter) && !hasSelection) {
        // Prevent default delete behaviour
        e.preventDefault();

        const updatedSelection = selectionStart - tabCharacter.length;

        this._applyEdits({
          // Remove tab character at caret
          value:
            value.substring(0, selectionStart - tabCharacter.length) +
            value.substring(selectionEnd),
          // Update caret position
          selectionStart: updatedSelection,
          selectionEnd: updatedSelection,
        });
      }
    } else if (e.keyCode === KEYCODE_ENTER) {
      // Ignore selections
      if (selectionStart === selectionEnd) {
        // Get the current line
        const line = value
          .substring(0, selectionStart)
          .split('\n')
          .pop();
        const matches = line.match(/^\s+/);

        if (matches && matches[0]) {
          e.preventDefault();

          // Preserve indentation on inserting a new line
          const indent = '\n' + matches[0];
          const updatedSelection = selectionStart + indent.length;

          this._applyEdits({
            // Insert indentation character at caret
            value:
              value.substring(0, selectionStart) +
              indent +
              value.substring(selectionEnd),
            // Update caret position
            selectionStart: updatedSelection,
            selectionEnd: updatedSelection,
          });
        }
      }
    } else if (
      e.keyCode === KEYCODE_Z &&
      e.metaKey !== e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();

      // Undo / Redo
      if (e.shiftKey) {
        this._redoEdit();
      } else {
        this._undoEdit();
      }
    }
  };

  _handleChange = (e: *) => {
    const { value, selectionStart, selectionEnd } = e.target;

    this._recordChange(
      {
        value,
        selectionStart,
        selectionEnd,
      },
      true
    );

    this.props.onValueChange(value);
  };

  _history: History = {
    stack: [],
    offset: -1,
  };

  _input: ?HTMLTextAreaElement;

  render() {
    const {
      value,
      style,
      padding,
      /* eslint-disable no-unused-vars */
      onValueChange,
      highlight,
      tabSize,
      insertSpaces,
      /* eslint-enable no-unused-vars */
      ...rest
    } = this.props;

    const contentStyle = {
      paddingTop: padding,
      paddingRight: padding,
      paddingBottom: padding,
      paddingLeft: padding,
    };

    return (
      <div {...rest} style={{ ...styles.container, ...style }}>
        <textarea
          ref={c => (this._input = c)}
          onKeyDown={this._handleKeyDown}
          style={{ ...styles.editor, ...styles.textarea, ...contentStyle }}
          value={value}
          onChange={this._handleChange}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-gramm={false}
        />
        <pre
          style={{ ...styles.editor, ...styles.highlight, ...contentStyle }}
          dangerouslySetInnerHTML={{ __html: this.state.html + '<br />' }}
        />
      </div>
    );
  }
}

const styles = {
  container: {
    position: 'relative',
    textAlign: 'left',
    whiteSpace: 'pre-wrap',
    overflow: 'hidden',
    padding: 0,
  },
  textarea: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    width: '100%',
    margin: 0,
    outline: 0,
    resize: 'none',
    background: 'none',
    overflow: 'hidden',
    MozOsxFontSmoothing: 'grayscale',
    WebkitFontSmoothing: 'antialiased',
    WebkitTextFillColor: 'transparent',
  },
  highlight: {
    position: 'relative',
    margin: 0,
    pointerEvents: 'none',
  },
  editor: {
    display: 'inherit',
    letterSpacing: 'inherit',
    lineHeight: 'inherit',
    fontFamily: 'inherit',
    fontWeight: 'inherit',
    fontSize: 'inherit',
    fontStyle: 'inherit',
    fontVariantLigatures: 'inherit',
    tabSize: 'inherit',
    textRendering: 'inherit',
    textTransform: 'inherit',
    textIndent: 'inherit',
    whiteSpace: 'inherit',
    boxSizing: 'inherit',
    borderTopWidth: 'inherit',
    borderRightWidth: 'inherit',
    borderBottomWidth: 'inherit',
    borderLeftWidth: 'inherit',
  },
};
