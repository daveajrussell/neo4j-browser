/* global jest */

import React from 'react'
import { render, fireEvent, wait } from 'react-testing-library'

import InputEnterStepping from './InputEnterStepping'

test('renders the render prop', () => {
  // When
  const { container } = render(
    <InputEnterStepping
      render={() => {
        return <div>hello</div>
      }}
    />
  )

  // Then
  expect(container).toMatchSnapshot()
})

test('focuses correctly and submits on enter in last input', async () => {
  // Given
  const myFn = jest.fn()

  // When
  const { container, getByValue } = render(
    <InputEnterStepping
      submitAction={myFn}
      render={({ getInputPropsForIndex, setRefForIndex }) => {
        return (
          <React.Fragment>
            <input
              {...getInputPropsForIndex(0, {
                initialFocus: true,
                defaultValue: 'first',
                ref: ref => setRefForIndex(0, ref)
              })}
            />
            <input
              {...getInputPropsForIndex(1, {
                defaultValue: 'second',
                ref: ref => setRefForIndex(1, ref)
              })}
            />
          </React.Fragment>
        )
      }}
    />
  )

  // Then
  expect(container).toMatchSnapshot()
  // Need to wait for the focus to get there, since it's set by setTimeout
  await wait(() => expect(document.activeElement).toEqual(getByValue('first')))

  // When
  // Enter in first should focus second
  fireEvent.keyDown(getByValue('first'), {
    key: 'Enter',
    keyCode: 13,
    which: 13
  })

  // Then
  expect(document.activeElement).toEqual(getByValue('second'))
  expect(myFn).toHaveBeenCalledTimes(0)

  // When
  // Enter in last should submit
  fireEvent.keyDown(getByValue('second'), {
    key: 'Enter',
    keyCode: 13,
    which: 13
  })

  // Then
  expect(document.activeElement).toEqual(getByValue('second'))
  expect(myFn).toHaveBeenCalledTimes(1)
})

test('submits on button click', async () => {
  // Given
  const myFn = jest.fn()

  // When
  const { container, getByText } = render(
    <InputEnterStepping
      submitAction={myFn}
      render={({ getInputPropsForIndex, getSubmitProps, setRefForIndex }) => {
        return (
          <React.Fragment>
            <input
              {...getInputPropsForIndex(0, {
                defaultValue: 'first',
                ref: ref => setRefForIndex(0, ref)
              })}
            />
            <input
              {...getInputPropsForIndex(1, {
                defaultValue: 'second',
                ref: ref => setRefForIndex(1, ref)
              })}
            />
            <button {...getSubmitProps()}>Send</button>
          </React.Fragment>
        )
      }}
    />
  )

  // Then
  expect(container).toMatchSnapshot()
  expect(myFn).toHaveBeenCalledTimes(0)

  // When
  // Click button!
  fireEvent.click(getByText('Send'))

  // Then
  expect(myFn).toHaveBeenCalledTimes(1)
})