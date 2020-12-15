/**
 * PrepStepFormGroup.js
 * A FormGroup which serves as an input of a preprocessing/augmentation step form
 */

import React from 'react';
import {Form, Card, Col, Button} from 'react-bootstrap';

import 'bootstrap/dist/css/bootstrap.min.css';
//import './outline.css';

class PrepStepFormGroup extends React.Component {

    constructor(props) {
        super(props);

        this.onDelete = this.onDelete.bind(this);
    }

    /**
     * A prop function passed from PrepStepsForm to update the above state
     */
    updateAbove(stepNumber, stepName, input) {
        stepNumber = (typeof stepNumber !== 'undefined') ? stepNumber : this.props.stepNumber;
        stepName = (typeof stepName !== 'undefined') ? stepName : this.props.stepName;
        input = (typeof input !== 'undefined') ? input : this.props.input;
        this.props.onFormGroupChange(stepNumber, stepName, input);
    }

    /**
     * Called when the delete button is pressed
     */
    onDelete() {
        this.props.onDelete(this.props.stepNumber);
    }

    // returns an input field
    getInputField(id, placeholder) {
        return (
            <Col>
                <Form.Control id={id}
                    type='text' 
                    placeholder={placeholder}
                    onChange={(e) => {this.setState({input: e}); this.updateAbove(undefined, undefined, e.target.value)}}
                    value={this.props.input}
                    disabled={this.props.stepName === ''}>

                </Form.Control>
            </Col>
        );
    }

    // clears the input field of a step if not selected
    setInput(stepValSelected) {
        if(stepValSelected === '') {
            let input = document.getElementById('inputField');
            input.value = '';
        }
    }

    // get a description label component based on the step name
    getDescription(stepValSelected) {
        let desc;
        if(stepValSelected === '') {
            desc = '';
        }
        else {
            for(let i in this.props.steps) {
                if(stepValSelected === this.props.steps[i].val) {
                    desc =  this.props.steps[i].description;
                }
            }
        }
        return (
            <Form.Label>Description: {desc}</Form.Label>
        );
    }

    // get a citation label component based on the step name
    getCitation(stepValSelected) {
        let cit;
        if(stepValSelected === '') {
            cit = '';
        }
        else {
            for(let i in this.props.steps) {
                if(stepValSelected === this.props.steps[i].val) {
                    cit = this.props.steps[i].citation;
                }
            }
        }
        return (
            <Form.Label>Citation: {cit}</Form.Label>
        );
    }

    render() {
        // get list of step options
        let stepOptions = this.props.steps.length > 0 && this.props.steps.map((item, i) => {
            return (
                <option value={item.val}>{item.name}</option>
            );
        });

        // select input for specific step
        let selectStepName = <Form.Control id='selectStepName'
                                as='select'
                                required='required'
                                onChange={(e) => {
                                                    //this.setState({stepName: e.target.value}); 
                                                    this.setInput(e.target.value); 
                                                    this.updateAbove(undefined, e.target.value, undefined)}}
                                value={this.props.stepName}>
                                    <option value=''>Select a step</option>
                                    {stepOptions}
                                </Form.Control>;

        // button to remove
        let deleteButton = <Button variant='outline-secondary' onClick={this.onDelete}>Delete</Button>

        return (
            <div id='main'>
                <Form.Group>
                    <Card border='primary'>
                        <Card.Body>
                            <Card.Title>Step {this.props.stepNumber}</Card.Title>
                            <Form.Row>
                                <Col xs={7}>
                                    {selectStepName}
                                </Col>
                                <Col>
                                    {this.getInputField('inputField', 'Input')}
                                </Col>
                                <Col xs='auto' display='inline-block'>
                                    {deleteButton}
                                </Col>
                            </Form.Row>
                            <Form.Row>
                                {this.getDescription(this.props.stepName)}
                            </Form.Row>
                            <Form.Row>
                                {this.getCitation(this.props.stepName)}
                            </Form.Row>
                        </Card.Body>
                    </Card>
                </Form.Group>
            </div>
        );
    }
}

export default PrepStepFormGroup;