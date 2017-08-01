/*
 * Copyright (c) 2002-2017 "Neo Technology,"
 * Network Engine for Objects in Lund AB [http://neotechnology.com]
 *
 * This file is part of Neo4j.
 *
 * Neo4j is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global cy, test, expect */
describe('Neo4j Browser', () => {
  it('loads', () => {
    cy.visit('http://localhost:8080')
    cy.title().should('include', 'Neo4j Browser')
  })
  it('sets new login credentials', () => {
    cy.title().should('include', 'Neo4j Browser')

    cy.get('input[data-test-id="boltaddress"]').type('bolt://localhost:7687')

    cy.get('input[data-test-id="username"]').should('have.value', 'neo4j')
    cy.get('input[data-test-id="password"]').should('have.value', '')

    cy.get('input[data-test-id="password"]').type('neo4j')

    cy.get('input[data-test-id="username"]').should('have.value', 'neo4j')

    cy.get('button[data-test-id="connect"]').click()

    // update password
    cy.get('input[data-test-id="newPassword"]')
    cy.get('input[data-test-id="newPassword"]').should('have.value', '')
    cy.get('input[data-test-id="newPasswordConfirmation"]').should('have.value', '')

    cy.get('input[data-test-id="newPassword"]').type('newpassword')
    cy.get('input[data-test-id="newPasswordConfirmation"]').type('newpassword')
    cy.get('button[data-test-id="changePassword"]').click()

    cy.get('input[data-test-id="changePassword"]').should('not.be.visible')

    cy.get('input[data-test-id="connect"]').should('not.be.visible')
    cy.wait(500)
    cy.get('[data-test-id="frameCommand"]').first().should('contain', ':play start')
  })
  it('can run cypher statement', () => {
    const cypher = 'return 1'
    cy.get('.ReactCodeMirror textarea').type(cypher, {force: true})
    cy.get('.ReactCodeMirror textarea').should('have.value', cypher)
    cy.get('[data-test-id="submitQuery"]').click()
    cy.get('[data-test-id="frameCommand"]').first().should('contain', cypher)

  })
})
