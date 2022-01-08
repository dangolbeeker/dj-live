import React from 'react';
import {Link} from 'react-router-dom';
import {successMessageTimeout, bugReportURL} from '../../mainroom.config';
import {Alert, Spinner} from 'reactstrap';

export const displayGenreAndCategory = ({genre, category}) => (
    <React.Fragment>
        {genre && <span><Link to={`/genre/${genre}`}>{genre}</Link>&nbsp;</span>}
        {category && <Link to={`/category/${category}`}>{category}</Link>}
    </React.Fragment>
);

export const displaySuccessMessage = (component, message, timeoutCallback) => {
    displayAlert(component, message, 'success', timeoutCallback, successMessageTimeout);
}

export const displayErrorMessage = (component, message, timeoutCallback) => {
    displayAlert(component, message, 'danger', timeoutCallback);
}

const displayAlert = (component, alertText, alertColor, timeoutCallback, timeout) => {
    component.setState({alertText, alertColor}, () => {
        if (timeout) {
            setTimeout(() => {
                component.setState({
                    alertText: '',
                    alertColor: ''
                });
                if (timeoutCallback) {
                    timeoutCallback();
                }
            }, timeout);
        }
    });
}

export const getAlert = component => (
    <Alert className='mt-3' isOpen={!!component.state.alertText} color={component.state.alertColor}>
        {component.state.alertText}
        {component.state.alertColor === 'danger' && (
            <div>
                Help us improve Mainroom and&nbsp;
                <a href={bugReportURL} target='_blank' rel='noopener noreferrer' className='alert-link'>
                    report a bug
                </a>.
            </div>
        )}
    </Alert>
);

export const LoadingSpinner = () => (
    <div className='position-relative h-100'>
        <Spinner color='dark' className='loading-spinner' />
    </div>
);