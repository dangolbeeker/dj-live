import React from 'react';
import {bugReportURL} from '../../mainroom.config';
import {Alert, Container} from 'reactstrap';

export default class ErrorBoundary extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            error: null,
            errorInfo: null
        };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    render() {
        if (this.state.errorInfo) {
            return (
                <Container>
                    <Alert className='text-center mt-3' color='danger'>
                        <h2>Oops! An error occurred :(</h2>
                        <h5>{this.state.error && this.state.error.toString()}</h5>
                        Help us improve Mainroom and&nbsp;
                        <a href={bugReportURL} target='_blank' rel='noopener noreferrer' className='alert-link'>
                            report a bug
                        </a>.
                    </Alert>
                </Container>
            );
        }
        return this.props.children;
    }

}